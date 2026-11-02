# ZAID KHAN — Architecture

WhatsApp AI Autopilot dashboard. Unofficial multi-device WhatsApp (Baileys) + Groq (Llama-class models)
+ Next.js glass dashboard, with approval-mode autopilot, a grounding knowledge base, handoff rules and
anti-ban safety limits.

Status: **Phase 1 implemented** (monorepo, schema + migration, API, glass dashboard shell,
AI rate-limit/usage layer — see §12). Sections §1–§10 are the approved plan; §12 records what
phase 1 actually built.

---

## 1. Hard decisions (and why)

| Area | Decision | Reason |
| --- | --- | --- |
| Runtime | Node **>=20.19** (dev box runs 26.x), **ESM everywhere** (`"type": "module"`) | Baileys 7 / Prisma 7 are ESM-first |
| WhatsApp | `@whiskeysockets/baileys@6.7.24` (**exact pin**) behind a `WhatsAppAdapter` interface | 7.x is still `7.0.0-rc14` on the `latest` tag; 6.7.24 is the maintained stable line. Adapter isolates a later 7.x swap |
| QR delivery | Never `printQRInTerminal` (removed/deprecated). Read `qr` from `connection.update` and push over Socket.IO; render with `qrcode` server-side → data URL + raw string | Official replacement path |
| Server | **Express 5** + `socket.io@4` + `zod` validation | Socket.IO attaches to a plain `http.Server` with zero ceremony; Fastify needs extra plumbing for no product benefit here |
| DB | **Prisma 7.10.1** (pinned; npm `latest` is `8.0.0-rc.29`, which has no `migrate`/`generate` and no real SQLite) + `@prisma/adapter-better-sqlite3` | v8 RC would break the whole DB workflow. v6 security patches end 19 Nov 2026, so v7 is the only sane new-project pin |
| Migrations | `prisma migrate dev` from day one (never `db push`) | SQLite→Postgres needs a clean, provider-specific history to replay |
| AI SDK | `groq-sdk` (OpenAI-compatible, base `https://api.groq.com/openai/v1`) behind `AiProvider` | Model is swappable in Settings; one wrapper file to change |
| Auth | Single-operator password login → signed httpOnly cookie; Socket.IO authenticates on handshake with the same cookie | Personal dashboard, not a SaaS. No OAuth surface to leak |
| Tenancy | Single-tenant, but every table carries `ownerId` | Cheap forward-compat for multi-number later |
| Monorepo | npm workspaces: `apps/server`, `apps/web`, `packages/shared` | Shared event/DTO types = one contract, no drift |

### ⚠️ Two spec deviations you must know about

1. **Llama is gone from the standard Groq API.** `llama-3.3-70b-versatile` and `llama-3.1-8b-instant` were
   decommissioned on **2026-08-16** for free/developer tiers; they now require an Enterprise committed-spend
   contract. Plan: default model is **`openai/gpt-oss-120b`** (fast tier `openai/gpt-oss-20b`), the model id is
   editable in Settings, and a `llama-3.3-70b-versatile` option remains selectable for anyone with enterprise
   access. The `AiProvider` wrapper means this is a one-line change, not a rewrite.
2. **The 21st.dev catalog is not authenticated in this environment.** `21st whoami` → *Not logged in*, and
   there is no browser here to run `21st login`. Catalog `search` is metadata, but `get`/`add`/`generate` are
   metered and need a token. Plan: build our own `components/ui/*` glass kit (shadcn-shaped: same file layout,
   `cn()` helper, CVA variants, `components.json`) so catalog items can be dropped in later. To unblock the
   catalog, set `TWENTYFIRST_TOKEN` as a project secret; then I run `21st search`/`21st add` per component.

---

## 2. Repository layout

```
zaid-khan/
├─ package.json                  # npm workspaces root, scripts: dev, build, test, db:*
├─ docs/
│  ├─ architecture.md            # this file
│  └─ phases.md                  # phase checklist + commit log
├─ packages/shared/src/
│  ├─ events.ts                  # Socket.IO event names + payload types (single source of truth)
│  ├─ dto.ts                     # ChatSummary, MessageDTO, SettingsDTO, AnalyticsDTO…
│  ├─ enums.ts                   # AutopilotMode, WaStatus, MessageStatus, HandoffReason…
│  └─ constants.ts               # safety defaults, event names, limits
├─ apps/server/
│  ├─ prisma/schema.prisma
│  ├─ prisma.config.ts           # Prisma 7 config (url lives here, not in schema)
│  ├─ src/index.ts               # bootstrap: env → db → wa → http → socket
│  ├─ src/config/env.ts          # zod-parsed env, fails fast
│  ├─ src/db/prisma.ts           # PrismaClient + better-sqlite3 adapter
│  ├─ src/http/{app,router,middleware/}/
│  │  ├─ routes/{auth,wa,chats,messages,settings,knowledge,analytics,notifications,health}.ts
│  │  └─ middleware/{auth,error,rate-limit,validate}.ts
│  ├─ src/socket/{index,handlers,emitter}.ts
│  ├─ src/whatsapp/
│  │  ├─ adapter.ts              # WhatsAppAdapter interface (send, presence, read, download, status)
│  │  ├─ baileys-adapter.ts      # only file that imports baileys
│  │  ├─ auth-store.ts           # AuthStore interface; FsAuthStore (useMultiFileAuthState) + DbAuthStore (later)
│  │  ├─ session-manager.ts      # connect/disconnect/reconnect/logout, QR lifecycle, status state machine
│  │  ├─ ingest.ts               # messages.upsert → normalize → persist → emit → autopilot
│  │  └─ normalizer.ts           # jid parsing, group detection, media typing, dedupe
│  ├─ src/ai/
│  │  ├─ provider.ts             # AiProvider interface (chat, transcribe) + model allowlist
│  │  ├─ groq-provider.ts        # groq-sdk implementation, retry/429 backoff
│  │  ├─ prompts.ts              # system prompt templates (strict, language-mirroring)
│  │  ├─ language.ts             # Urdu / Roman-Urdu / English detection
│  │  ├─ safety.ts               # OTP/password/card detection, anger detection, confidence gate
│  │  ├─ rag.ts                  # knowledge retrieval (SQLite FTS5 + keyword score, top-k)
│  │  ├─ autopilot.ts            # orchestration pipeline (the brain)
│  │  └─ handoff.ts              # handoff reasons → tag + notification
│  ├─ src/safety/antiban.ts      # delays, typing, daily cap, consecutive-reply cap, cooldowns
│  ├─ src/services/{analytics,notifications,settings.crypto}.ts
│  ├─ src/logging.ts             # pino with redaction (never log message bodies or keys)
│  └─ test/                      # vitest: safety, language, rag, antiban, pipeline (mock adapter)
└─ apps/web/                     # Next.js 16 App Router
   ├─ app/(auth)/login/page.tsx
   ├─ app/(app)/layout.tsx       # glass shell: sidebar + topbar + second column
   ├─ app/(app)/dashboard|chats|chats/[id]|autopilot|contacts|knowledge|analytics|settings|connect/page.tsx
   ├─ components/ui/             # our kit: glass-card, sidebar-pill, pill-tabs, toggle, select-with-search,
   │                             # password-input, phone-input, stepper, progress, checkbox, chip, button, toast
   ├─ components/layout/         # sidebar, topbar, secondary-nav, mobile-bottom-bar
   ├─ components/domain/         # chat-list-row, message-bubble, qr-panel, kb-editor, kpi-card, chart
   ├─ lib/{api.ts,socket.ts,auth.ts,format.ts}
   ├─ styles/globals.css         # Tailwind v4 @theme tokens
   └─ middleware.ts              # cookie gate on /(app)
```

Next.js only renders UI. Every business operation goes to the Express server; `next.config.ts` rewrites
`/api/*` and `/socket.io/*` to the server so cookies stay first-party and there is exactly one CORS origin.

---

## 3. Runtime topology

```
Browser (Next 16, glass UI)
   │  REST /api/*  (cookie auth)
   │  WS   /socket.io (same cookie on handshake)
   ▼
Express 5  ──────────────►  SQLite (Prisma 7, data/zaidkhan.db)
   │  ▲                        ▲
   │  │ emit events            │ persist
   ▼  │                        │
Autopilot pipeline ───► Groq API (chat + whisper)
   ▲                    (key: AES-256-GCM in Settings table)
   │ inbound messages
Baileys session manager  ◄── data/baileys/<sessionId>/ (creds, gitignored)
```

One long-lived process. Baileys and Socket.IO share it so in-memory socket events and the WhatsApp socket
never desync. Single-instance by design (Baileys is stateful; scaling out would need a session owner).

---

## 4. Data model (Prisma 7, SQLite now → Postgres later)

Enums are TEXT-emulated on SQLite (not DB-enforced) and `Json` is supported — deliberately **no scalar lists**
(`String[]`), which SQLite cannot do. Connection string from `prisma.config.ts` → `DATABASE_URL`.

```prisma
generator client { provider = "prisma-client"  output = "../src/generated/prisma" }
datasource db    { provider = "sqlite" }

enum AutopilotMode { OFF APPROVAL FULL_AUTO }
enum WaStatus      { DISCONNECTED CONNECTING QR_PENDING CONNECTED RECONNECTING LOGGED_OUT ERROR }
enum Direction     { INBOUND OUTBOUND }
enum Author        { CUSTOMER AI HUMAN SYSTEM }
enum MessageKind   { TEXT AUDIO IMAGE DOCUMENT STICKER REACTION OTHER }
enum MessageStatus { RECEIVED SKIPPED DRAFTED APPROVED REJECTED SENDING SENT FAILED }
enum HandoffReason { LOW_CONFIDENCE ANGRY_CUSTOMER SENSITIVE_PAYMENT SENSITIVE_CREDENTIALS
                     EXPLICIT_REQUEST OUT_OF_HOURS UNSUPPORTED_MEDIA AI_ERROR }
enum KnowledgeCategory { PRODUCT PRICE FAQ POLICY HOURS CONTACT OTHER }
enum NotificationType  { HANDOFF QR_REQUIRED LIMIT_REACHED AI_ERROR CONNECTION INFO }

model Settings {          // single row, id = "singleton"
  id                  String @id @default("singleton")
  ownerId             String @default("owner")
  groqApiKeyEnc       String?          // AES-256-GCM, never returned to client
  groqApiKeyLast4     String?          // display only
  aiModel             String  @default("openai/gpt-oss-120b")
  transcriptionModel  String  @default("whisper-large-v3-turbo")
  autopilotMode       AutopilotMode @default(APPROVAL)   // spec default
  businessName        String  @default("ZAID KHAN")
  persona             String?                            // tone of voice
  workingHoursEnabled Boolean @default(false)
  workingDays         Json    @default("[1,2,3,4,5,6]")  // 0=Sun
  workingStart        String  @default("09:00")
  workingEnd          String  @default("21:00")
  timezone            String  @default("Asia/Karachi")
  outOfHoursMessage   String?
  replyDelayMinSec    Int     @default(4)                // anti-ban window 4–12s
  replyDelayMaxSec    Int     @default(12)
  dailyReplyLimit     Int     @default(200)
  maxConsecutiveAi    Int     @default(3)
  sendTypingPresence  Boolean @default(true)
  confidenceThreshold Float   @default(0.55)
  maxOutputTokens     Int     @default(300)   // reply length cap (§12)
  skipTrivialMessages Boolean @default(true)  // ignore ok/thanks/emoji (§12)
  cacheReuseEnabled   Boolean @default(true)  // reuse near-duplicate answers (§12)
  dailyRequestBudget  Int     @default(500)
  dailyTokenBudget    Int     @default(200000)
  budgetPolicy        BudgetPolicy @default(PAUSE_AI)
  outOfLimitAutoReply Boolean @default(false)
  updatedAt           DateTime @updatedAt
}

model WhatsAppSession {
  id                   String @id @default(cuid())
  ownerId              String @default("owner")
  status               WaStatus @default(DISCONNECTED)
  phoneNumber          String?
  pushName             String?
  credsDir             String            // data/baileys/<id>
  lastQrAt             DateTime?
  lastConnectedAt      DateTime?
  lastDisconnectCode   Int?
  lastDisconnectReason String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Contact {
  id                String @id @default(cuid())
  ownerId           String @default("owner")
  waJid             String @unique         // e.g. 92300…@s.whatsapp.net
  phone             String?
  name              String?                // saved name from WhatsApp
  pushName          String?                // their own display name
  isGroup           Boolean @default(false)
  isWhitelisted     Boolean @default(false) // autopilot allowed even if global rules say no
  isBlacklisted     Boolean @default(false) // never autopilot
  isExcluded        Boolean @default(false) // family/friends, never autopilot
  excludeReason     String?
  autopilotEnabled  Boolean?                // null = inherit global mode
  needsHuman        Boolean @default(false)
  needsHumanReason  String?
  tags              Json?
  inboundCount      Int @default(0)         // "only reply to people who message first"
  unreadCount       Int @default(0)
  lastMessageAt     DateTime?
  lastMessagePreview String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  messages Message[]
  handoffs HandoffEvent[]
}

model Message {
  id            String @id @default(cuid())
  ownerId       String @default("owner")
  waMessageId   String @unique              // idempotency key for ingest
  contactId     String
  contact       Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  chatJid       String
  direction     Direction
  author        Author
  kind          MessageKind @default(TEXT)
  text          String?                     // inbound text or AI/human outbound text
  draftText     String?                     // pending AI proposal (APPROVAL mode)
  transcript    String?                     // Whisper output for voice notes
  mediaMime     String?
  mediaPath     String?                     // data/media/…, gitignored
  status        MessageStatus @default(RECEIVED)
  skipReason    String?                     // why autopilot ignored it
  handoffReason HandoffReason?
  aiModel       String?
  confidence    Float?
  latencyMs     Int?
  tokensIn      Int?
  tokensOut     Int?
  waTimestamp   DateTime
  createdAt     DateTime @default(now())
  sentAt        DateTime?
  @@index([contactId, waTimestamp])
  @@index([status, createdAt])
}

model KnowledgeEntry {
  id        String @id @default(cuid())
  ownerId   String @default("owner")
  title     String
  category  KnowledgeCategory @default(FAQ)
  content   String
  keywords  String?            // space/comma separated, boosts retrieval
  price     Float?
  currency  String?
  active    Boolean @default(true)
  source    String?            // "manual" | "upload:<filename>"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model HandoffEvent {
  id        String @id @default(cuid())
  ownerId   String @default("owner")
  contactId String
  contact   Contact @relation(fields: [contactId], references: [id], onDelete: Cascade)
  messageId String?
  reason    HandoffReason
  note      String?
  resolvedAt DateTime?
  createdAt DateTime @default(now())
  @@index([createdAt])
}

model Notification {
  id        String @id @default(cuid())
  ownerId   String @default("owner")
  type      NotificationType
  title     String
  body      String
  contactId String?
  read      Boolean @default(false)
  createdAt DateTime @default(now())
  @@index([read, createdAt])
}

model DailyStat {
  id                String @id @default(cuid())
  date              String @unique      // YYYY-MM-DD in Settings.timezone
  inbound           Int @default(0)
  aiReplies         Int @default(0)
  humanReplies      Int @default(0)
  draftsCreated     Int @default(0)
  draftsApproved    Int @default(0)
  handoffs          Int @default(0)
  skips             Int @default(0)
  responseMsTotal   Int @default(0)     // inbound→outbound, averaged at read time
  responseCount     Int @default(0)
  aiTokens          Int @default(0)
  transcriptionSec  Float @default(0)
}

// --- added in phase 1: free-tier resilience (§12) ---
model AiUsage {
  id               String   @id @default(cuid())
  date             String   // YYYY-MM-DD in Settings.timezone
  model            String
  requests         Int      @default(0)
  promptTokens     Int      @default(0)
  completionTokens Int      @default(0)
  rateLimitHits    Int      @default(0)
  errors           Int      @default(0)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@unique([date, model])
  @@index([date])
}

model AiRateLimitState {                // last headers seen from Groq
  id                String   @id @default("current")
  remainingRequests Int?
  limitRequests     Int?
  resetRequestsAt   DateTime?
  remainingTokens   Int?
  limitTokens       Int?
  resetTokensAt     DateTime?
  retryAfterSec     Int?
  updatedAt         DateTime @updatedAt
}

model AppSession {                      // login sessions (hashed token)
  id        String @id @default(cuid())
  tokenHash String @unique
  userAgent String?
  createdAt DateTime @default(now())
  expiresAt DateTime
  lastUsedAt DateTime @default(now())
}
```

**Postgres migration path** (documented, not implemented): set `provider = "postgresql"`, swap
`@prisma/adapter-better-sqlite3` → `@prisma/adapter-pg`, archive `prisma/migrations`, regenerate an initial
migration, then ETL. No SQLite-specific raw SQL is used outside the FTS search helper, which is behind
`src/ai/rag.ts` with a Postgres branch planned (`to_tsvector`).

---

## 5. REST contract

All JSON. Auth: `zk_session` httpOnly cookie; every route except `/api/health` and `/api/auth/login` returns
**401** without it. Errors: `{ error: { code, message, details? } }`. Validation with zod, 400 on failure.

### Auth
| Method | Path | Body / Query | Returns |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | `{ password }` | `{ ok, expiresAt }` + cookie |
| POST | `/api/auth/logout` | – | `{ ok }` |
| GET | `/api/auth/me` | – | `{ authenticated, name }` |

### WhatsApp linking
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/wa/status` | – | `{ status, phoneNumber, pushName, lastQrAt, lastConnectedAt }` |
| POST | `/api/wa/connect` | – | `{ status }` (idempotent; starts socket if not running) |
| GET | `/api/wa/qr` | – | `{ qr: string \| null, imageDataUrl: string \| null, generatedAt }` |
| POST | `/api/wa/pairing-code` | `{ phone }` | `{ code }` (8-digit alt to QR) |
| POST | `/api/wa/logout` | – | `{ ok }` (wipes creds dir + DB status → LOGGED_OUT) |
| POST | `/api/wa/reconnect` | – | `{ status }` |

### Chats & messages
| Method | Path | Body / Query | Returns |
| --- | --- | --- | --- |
| GET | `/api/chats` | `?q=&filter=all\|unread\|needs_human\|autopilot&cursor=&limit=40` | `{ items: ChatSummary[], nextCursor }` |
| GET | `/api/chats/:id` | – | `ChatDetail` |
| PATCH | `/api/chats/:id` | `{ name?, autopilotEnabled?, needsHuman?, isWhitelisted?, isBlacklisted?, isExcluded?, tags? }` | `ChatSummary` |
| GET | `/api/chats/:id/messages` | `?cursor=&limit=40` | `{ items: MessageDTO[], nextCursor }` |
| POST | `/api/chats/:id/read` | – | `{ ok, unreadCount: 0 }` |
| POST | `/api/chats/:id/messages` | `{ text }` | `MessageDTO` (human send; bypasses AI, still rate-limited) |
| POST | `/api/messages/:id/approve` | `{ text? }` (edit-before-send) | `MessageDTO` |
| POST | `/api/messages/:id/reject` | `{ reason? }` | `MessageDTO` |
| POST | `/api/messages/:id/retry` | – | `MessageDTO` |

### Settings
| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | `/api/settings` | – | `SettingsDTO` — **key as `{ groqKeyConfigured: bool, groqKeyLast4 }`, never the key** |
| PUT | `/api/settings` | partial settings | `SettingsDTO` |
| PUT | `/api/settings/groq-key` | `{ apiKey }` | `{ groqKeyConfigured: true, groqKeyLast4 }` — encrypted at rest |
| DELETE | `/api/settings/groq-key` | – | `{ groqKeyConfigured: false }` |
| POST | `/api/settings/test-ai` | – | `{ ok, model, latencyMs }` (1-token probe, no message content) |

### Knowledge base
| Method | Path | Body / Query | Returns |
| --- | --- | --- | --- |
| GET | `/api/knowledge` | `?q=&category=&active=` | `{ items: KnowledgeDTO[] }` |
| POST | `/api/knowledge` | `{ title, category, content, keywords?, price?, currency? }` | `KnowledgeDTO` |
| PATCH | `/api/knowledge/:id` | partial | `KnowledgeDTO` |
| DELETE | `/api/knowledge/:id` | – | `{ ok }` |
| POST | `/api/knowledge/upload` | multipart `file` (.txt/.md/.csv/.json) **or** `{ text }` paste | `{ created: number, items: KnowledgeDTO[] }` |
| POST | `/api/knowledge/search` | `{ query, k? }` | `{ matches: { id, title, score, snippet }[] }` — debug the RAG |

### Analytics / notifications
| Method | Path | Query | Returns |
| --- | --- | --- | --- |
| GET | `/api/analytics/summary` | `?range=7d\|30d\|90d` | `{ totals, series: DailyPoint[], avgResponseMs, aiShare }` |
| GET | `/api/notifications` | `?unreadOnly=` | `{ items, unread }` |
| POST | `/api/notifications/:id/read` | – | `{ ok }` |
| POST | `/api/notifications/read-all` | – | `{ ok }` |
| GET | `/api/settings/ai/models` | – | `{ models, selected, fallback, source: 'groq'\|'static', warning? }` — live from the key's entitlements |
| POST | `/api/settings/ai/test` | – | `{ ok, model, latencyMs, usedFallback }` (12-token probe, no customer data) |
| GET | `/api/ai/usage` | – | `AiUsageSnapshot` (also pushed as `ai:usage`) |
| GET | `/api/ai/limits` | – | `{ rateLimits, queueDepth, retryQueueDepth }` |
| POST | `/api/dev/simulate/rate-limit` | `{ failures }` | `{ armed }` — **dev only**, 404 in production |
| POST | `/api/dev/simulate/rate-limit/reset` | – | `{ armed: 0 }` — **dev only** |
| GET | `/api/health` | – | `{ ok, wa: WaStatus, db: 'ok', version }` (public, no secrets) |

---

## 6. Socket.IO contract (`packages/shared/src/events.ts`)

Handshake: cookie `zk_session` verified in `io.use()`; reject → `connect_error` with code
`UNAUTHORIZED`. One default namespace, one room `owner` (single operator). Payloads are typed in
`packages/shared` and imported by both apps — the contract cannot drift.

### server → client
| Event | Payload | Notes |
| --- | --- | --- |
| `wa:status` | `{ status, phoneNumber?, pushName?, lastDisconnectCode? }` | on connect + every state transition |
| `wa:qr` | `{ qr, imageDataUrl, generatedAt }` | repeats every ~20s until linked |
| `wa:pairing-code` | `{ code }` | pairing-code flow |
| `chat:upsert` | `{ chat: ChatSummary }` | new contact or changed preview/unread |
| `chat:updated` | `{ chatId, patch: Partial<ChatSummary> }` | toggle, tag, needsHuman |
| `message:new` | `{ message: MessageDTO }` | inbound **or** outbound |
| `message:updated` | `{ messageId, chatId, patch }` | DRAFTED→APPROVED→SENDING→SENT/FAILED |
| `message:draft` | `{ messageId, chatId, draft, confidence, reasons: HandoffReason[], model }` | approval queue |
| `typing` | `{ chatId, who: 'customer'\|'ai'\|'human', isTyping }` | customer typing + our composing state |
| `notification:new` | `{ notification: NotificationDTO }` | drives the toast |
| `ai:usage` | `AiUsageSnapshot` | requests/tokens vs budget, rate-limit window, queue depth (§12) |
| `ai:limit` | `AiLimitEvent` | `rate_limited` / `budget_exceeded` / `recovered` (§12) |
| `analytics:tick` | `{ today: DailyPoint }` | live KPI cards |
| `toast` | `{ level: 'info'\|'success'\|'warn'\|'error', title, message }` | non-persistent UI toasts |

### client → server
| Event | Payload | Notes |
| --- | --- | --- |
| `chat:open` | `{ chatId }` | subscribe to a chat; also clears unread server-side |
| `chat:close` | `{ chatId }` | – |
| `presence:read` | `{ chatId, messageIds }` | human read receipts |
| `ping:app` | – | latency probe |

Reconnect strategy is client-side: exponential backoff with jitter, re-fetch the open chat + status on
`socket.on('connect')` (events during the gap are not replayed; cursor pagination is the recovery path).

---

## 7. Autopilot pipeline (`src/ai/autopilot.ts`)

Triggered by every inbound message. Strict order — safety **before** the LLM is ever called.

```
1  INGEST       messages.upsert(type='notify') → normalize → dedupe on waMessageId → persist → emit
2  GATE (skip, persisted as SKIPPED with skipReason, no AI cost)
     • fromMe / status@broadcast / newsletter → skip
     • group chat → skip unless contact.isWhitelisted
     • isBlacklisted → skip      • isExcluded (family) → skip
     • contact.autopilotEnabled === false → skip
     • global mode OFF → skip
     • inboundCount === 0 (never replied to a cold outbound) → skip
     • daily reply cap reached → skip + NOTIFICATION(LIMIT_REACHED)
     • duplicate in-flight reply for this chat → skip
3  NORMALIZE TEXT   voice note → Whisper (whisper-large-v3-turbo) → transcript
                     image/document/sticker → optional label + handoff if unknown intent
4  SENSITIVE SCAN   regex+lexicon for OTP, password, PIN, card/CVV, bank details, "share the code"
                     → HARD handoff, AI never composes. Urdu + Roman Urdu patterns included.
5  LANGUAGE         detect ur/en/roman-ur (script + stopword scoring) → reply language directive
6  GROUNDING        rag.ts: FTS5 + keyword score over active KnowledgeEntry, top-k = 4
7  CLASSIFY+COMPOSE one Groq call returning strict JSON:
                     { language, intent, sentiment, needsHuman, confidence, reply, usedKbIds[] }
                     system prompt: answer only from KB, never invent prices, no OTP/creds,
                     mirror language, short WhatsApp-style replies, escalate when unsure
8  POST-CHECKS      • price mentioned but absent from KB → handoff(LOW_CONFIDENCE)
                     • sentiment angry/abusive → handoff(ANGRY_CUSTOMER)
                     • confidence < settings.confidenceThreshold → handoff(LOW_CONFIDENCE)
                     • reply contains OTP/password/card pattern → block, handoff
9  DELIVER          OFF/APPROVAL → persist DRAFTED + emit message:draft (+notification)
                     FULL_AUTO   → antiban.delay(4–12s) → sendPresenceUpdate('composing')
                                   → refresh presence every ~8s while "typing"
                                   → send → SENT → analytics
10 RECORD           DailyStat counters, latency, tokens, HandoffEvent, notification
```

**Anti-ban module (`src/safety/antiban.ts`)** — enforced centrally, not per-caller:
random delay from `[replyDelayMin, replyDelayMax]`; `composing` presence with periodic refresh
(WhatsApp presence expires ~10s); per-contact cooldown; max consecutive AI replies
(`maxConsecutiveAi`, default 3) then forced handoff; global daily reply limit persisted in `DailyStat`;
**no broadcast/bulk endpoint exists at all**; outbound only ever targets a JID that messaged first.

**Working hours**: outside the window → send `outOfHoursMessage` (once per contact per N hours, itself
counted against the daily limit) and skip AI composition unless the message is a handoff trigger.

---

## 8. Security & privacy

- **Groq key**: entered in Settings → `AES-256-GCM` with `APP_ENCRYPTION_KEY` (32-byte base64, `.env`) →
  `Settings.groqApiKeyEnc`. `GET /api/settings` returns only `groqKeyConfigured` + last 4 chars. The key is
  decrypted inside `groq-provider.ts` only, never crosses the API boundary, never reaches the browser bundle.
- **No secrets in the client**: only `NEXT_PUBLIC_API_URL`-free, same-origin calls; no server key is ever
  imported by a client component. `packages/shared` contains types only.
- **No message-content logging**: pino `redact` on `text`, `draftText`, `transcript`, `apiKey`,
  `groqApiKeyEnc`, `req.headers.cookie`. Request logs carry ids and counts, never bodies.
- **Baileys creds**: `data/baileys/` gitignored, `chmod 700`; logout deletes the folder.
- **Uploads**: knowledge uploads capped at 2 MB, text-extracted only, no execution, stored as rows.
- **Rate limiting**: login (5/min/IP), send & approve (per-contact cooldown), everything else 120/min.
- **Cookie**: httpOnly, sameSite=lax, secure in production, 30-day expiry, hashed token in `AppSession`.

---

## 9. Frontend architecture

Stack: **Next.js 16.4 App Router**, React 19, **Tailwind v4** (CSS-first `@theme`), shadcn-shaped local kit,
`lucide-react` icons, `recharts` for the analytics chart, `sonner`-style custom toast (matches our glass style),
`Plus Jakarta Sans` via `next/font`.

### Design tokens (from the reference image)
```
--navy       #0B1437   /* pill tabs, primary CTA, headings */
--blue       #3B8EF0   /* active sidebar circle, active nav block, primary buttons */
--mint       #2EE6A6   /* success / mint pill CTA */
--sky-50/100 soft blurred sky-blue → white page background + radial gradients
--glass      rgb(255 255 255 / 0.60)      /* panels  */
--glass-strong rgb(255 255 255 / 0.78)    /* rows, inputs */
--glass-border rgb(255 255 255 / 0.65), 1px
--ring       #3B8EF0
--radius-panel 28px  --radius-card 20px  --radius-pill 999px
shadow-glass 0 24px 60px -24px rgb(11 20 55 / 0.28)
```
Typography: Plus Jakarta Sans, 14/16 base, 600 for active nav, 700 for KPI numbers, `tabular-nums` on stats.

### Shell (mirrors the reference)
- Full-bleed background: sky-blue/white gradient + 3 blurred blobs, `fixed inset-0 -z-10`.
- **Floating pill sidebar** (left, ~72px wide, glass, `rounded-full`): 8 icon buttons — Dashboard, Chats,
  Autopilot, Contacts, Knowledge Base, Analytics, Settings, WhatsApp Connect. Active = filled blue circle with
  white icon; hover = tooltip pill to the right. On `<768px` it becomes a fixed bottom bar with 5 primary items
  (`aria-current`, safe-area padding).
- **Topbar**: `ZAID KHAN` wordmark left → glass breadcrumb pill (`Home › Dashboard`, derived from the route) →
  right cluster: help, language (EN/اردو), menu, avatar (all with `aria-label`).
- **Second column** (~300px, glass): search input with icon + secondary nav list (Chats, Needs Human,
  Autopilot Rules, Notifications w/ count). Active item = solid blue rounded block.
- **Main area**: pill tabs (active navy `#0B1437`, white text), content as soft white rounded cards with status
  badges, small navy `Details`/`Open` button, dismissible rows (`×`).
- Component kit to match the reference: select-with-search, labeled input, password input w/ eye toggle,
  phone input w/ country flag, stepper ±, progress bar w/ %, checkbox + description, toggle switch, chips
  (red/yellow/green/blue/purple/cyan), CTAs (navy pill, outline pill, blue pill, mint pill, white pill),
  top-right toast with close button.

### Screens
| Route | Contents |
| --- | --- |
| `/login` | centered glass card, password field w/ eye toggle |
| `/dashboard` | KPI cards (AI vs human, avg response, needs-human, daily limit ring), today's chart, recent chats, safety-status card |
| `/chats` | chat list (search, filter chips, unread badges, Needs-human tag) |
| `/chats/[id]` | message thread (live), composer, autopilot toggle for this chat, approval queue with Approve/Edit/Reject |
| `/autopilot` | global mode selector (Off/Approval/Full auto), delays, daily limit, confidence slider, consecutive cap, working hours |
| `/contacts` | whitelist/blacklist/exclude management, per-contact autopilot override |
| `/knowledge` | paste/upload, category chips, table with active toggles, "test retrieval" box |
| `/analytics` | per-day chart (AI vs human), handoff reasons breakdown, response time |
| `/settings` | Groq key (password input, shows last-4 when set), model select, persona, business name, timezone |
| `/connect` | live QR panel with countdown + refresh, status timeline, pairing-code fallback, logout/relink |

Accessibility: visible `focus-visible` rings (`--ring`, 2px offset), real `<button>`/`<label>` elements,
`aria-live` for the toast + connection status, contrast checked on glass (text on glass uses navy at 90%
minimum), keyboard-navigable tabs, `prefers-reduced-motion` honoured.

Dark mode: **not in this build** — tokens are defined as CSS variables so a `.dark` theme is additive later.

---

## 10. Phases and commits

| Phase | Scope | Exit check |
| --- | --- | --- |
| 0 | This document | – |
| 1 | Monorepo skeleton, env config, Prisma schema + initial migration, Express bootstrap, Next shell + design system + sidebar/topbar/secondary nav, `/login`, `/dashboard` shell | server `/api/health` 200; web renders shell; token check |
| 2 | Baileys adapter + session manager, QR over socket, creds persistence, chat ingest, live chat list/thread, search, unread | QR renders & refreshes; restart keeps session; live message appears without refresh |
| 3 | Groq provider, prompts, language detect, safety scan, approval mode, approve/edit/reject, AI model in settings | mock + real round trip; drafts appear; nothing sends in APPROVAL |
| 4 | Full-auto, antiban (delay, presence, caps, cooldowns), working hours, handoff, notifications | safety unit tests green; delays observed in logs (no bodies) |
| 5 | Knowledge base CRUD + upload + retrieval, grounding checks, handoff reasons surfaced in UI | price question without KB → handoff, not invention |
| 6 | Analytics + chart, polish, responsive/a11y pass, README (setup, QR, VPS+PM2, Baileys warning) | `npm run build` + `npm test` green; README complete |

Each phase ends with a commit. Tests are vitest in `apps/server/test`: safety regexes (ur/roman-ur/en),
language detection, RAG scoring, antiban timing/caps, pipeline state transitions with a mock WhatsApp adapter
and a stub AI provider — no network, no real WhatsApp account, no real API key in CI.

---

## 11. Open questions / accepted risks

1. **Groq model default** — `openai/gpt-oss-120b` because Llama was decommissioned; confirm this is acceptable
   (Settings keeps it editable).
2. **21st catalog** — blocked until a `TWENTYFIRST_TOKEN` is provided; the hand-built kit is the fallback.
3. **Baileys version** — pinned 6.7.24; if WhatsApp protocol changes break it, moving to 7.x is contained to
   `baileys-adapter.ts` but not free.
4. **Ban risk** — unofficial API; mitigations are delay/presence/caps, but no mitigation is a guarantee.
   Recommend a secondary number, documented in the README.
5. **Auth store** — filesystem (`useMultiFileAuthState`) first for reliability; `DbAuthStore` is a documented
   later step behind the same interface.
6. **Single instance only** — Baileys state is process-local; PM2 must run `instances: 1` (documented).
