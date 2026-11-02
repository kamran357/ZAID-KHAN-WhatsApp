# ZAID KHAN — WhatsApp AI Autopilot

An AI autopilot for WhatsApp with a glass dashboard: it reads incoming messages, answers from **your**
knowledge base only, drafts replies for your approval (default) or sends them itself, and stops the moment
a conversation needs a human.

> **Unofficial client.** This uses [Baileys](https://github.com/WhiskeySockets/Baileys), which implements the
> WhatsApp Web protocol rather than the official Business API. Accounts can be banned. Test with a
> secondary number first, never a number you cannot afford to lose.

---

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Architecture (`docs/architecture.md`) | ✅ |
| 1 | Monorepo, Prisma 7 schema + migration, API, glass design system, shell, login, dashboard, settings, **AI rate-limit + usage layer** | ✅ |
| 2 | Baileys QR linking, live chat list/thread, search, unread | ⏳ next |
| 3 | Groq replies, language mirroring, approval mode, approve/edit/reject | ⏳ |
| 4 | Full auto, anti-ban pacing, working hours, handoff rules | ⏳ |
| 5 | Knowledge base + grounded answers + handoff reasons | ⏳ |
| 6 | Analytics charts, a11y/responsive pass, polish, dark mode | ⏳ |

What works right now: login, dashboard with live AI-budget widget, analytics summary, settings
(model list from your Groq key, budgets, pacing, working hours), encrypted key storage, the Groq
provider with retry/fallback/queue/cache/budget logic (unit tested), and a dev 429 simulator.

---

## Stack

- **Server** — Node 20+, TypeScript (ESM), Express 5, Socket.IO 4, Prisma 7 + SQLite (`better-sqlite3`),
  Groq via a small `fetch` wrapper (no SDK lock-in).
- **Web** — Next.js 16 (App Router), React 19, Tailwind v4, hand-built shadcn-shaped glass component kit.
- **Shared** — `packages/shared` holds the Socket.IO contract, DTOs and enums imported by both apps.

## Quick start

```bash
# 1. install (workspaces)
npm install

# 2. environment
cp .env.example apps/server/.env
#    edit AUTH_PASSWORD at minimum; generate the encryption key with:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# 3. shared types + database
npm run setup        # builds @zk/shared, generates the Prisma client, applies migrations

# 4. run both apps (API :4000, dashboard :3000)
npm run dev
```

Open <http://localhost:3000> → sign in with `AUTH_PASSWORD` (default `zaidkhan` — change it).

### Other scripts

```bash
npm test                 # server unit tests (vitest)
npm run typecheck        # shared + server + web
npm run build            # production builds
npm run db:studio        # inspect the SQLite database
```

## Adding your Groq key

1. Settings → **Groq connection** → paste a key from <https://console.groq.com/keys>.
2. The key is encrypted with AES-256-GCM (`APP_ENCRYPTION_KEY`) and stored in SQLite. The API only ever
   returns `configured` + the last 4 characters — it never travels back to the browser.
3. **Load models** happens automatically: the picker is populated from `GET /v1/models` with your key, so
   you only see models your account can actually use.
4. Pick a primary model and (optionally) a fallback, then press **Test**.

> Llama models (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) were decommissioned for free/developer
> Groq tiers on 2026-08-16. The default is `openai/gpt-oss-120b`; anything your key lists is selectable.

## How the AI survives a free tier

| Mechanism | Behaviour |
| --- | --- |
| Header capture | Every Groq response (success *and* 429) updates remaining requests/tokens + reset times, in memory and in SQLite. |
| Retry | Up to 3 attempts, exponential backoff + jitter, `Retry-After` respected. |
| Fallback | If the primary model is exhausted, the fallback model is tried once. |
| Never a broken reply | If both fail, the message is marked `AI_RATE_LIMITED`, no draft is kept, the chat is tagged **Needs human**, and a notification is raised. |
| Retry queue | Rate-limited messages wait until the reported reset, then re-run through the pipeline (full auto only sends if the message is < 30 min old, otherwise it drafts). |
| Small prompts | Last 8 messages + top 4 knowledge snippets + `max_tokens` cap (default 300). |
| Skip the model | Reactions, stickers and "ok/thanks/👍" are ignored (configurable). |
| Cache | A near-duplicate question (≥ 0.82 token similarity) is answered from cache instead of a new call. |
| Budget | Your own daily request/token limits; 60% warn, 85% critical, 100% applies the policy: **Pause AI** (default) or **Draft only**. |
| Courtesy reply | Optional, off by default: one short "we received your message" per chat per 6 hours. |

### Simulating a 429 locally

```bash
# arm the next 2 Groq calls to fail with 429 (dev only)
curl -b cookie.txt -X POST -H 'content-type: application/json' \
  -d '{"failures":2}' http://localhost:4000/api/dev/simulate/rate-limit
```

Or press **Settings → Developer tools → Simulate 429**, then **Test**. The server logs
`ai/rate-limited` (counts only), the retry, and the fallback attempt. With no fallback model
configured, the second failure takes the Needs-human path. Clear it with
`POST /api/dev/simulate/rate-limit/reset`.

## Security rules enforced in code

- OTP / password / PIN / card / CVV / IBAN / wallet-detail requests are detected in **Urdu, Roman Urdu and
  English** *before* any model call, and force a handoff. The AI is never asked to compose around them.
- Blacklisted, excluded (family/friends) and group chats are never auto-replied; cold outbound is impossible
  because only contacts who messaged first can receive an AI reply.
- Random 4–12 s delay, `composing` presence, per-chat cooldown, daily reply cap, max consecutive AI replies.
  There is no broadcast/bulk endpoint in the codebase.
- Logs contain ids, counts and error codes only — message text, transcripts, prompts and keys are redacted
  by the logger and never written.
- Session cookie is httpOnly + SameSite=Lax, backed by a hashed token in SQLite (30 days).

## Project layout

```
apps/server   Express API, Prisma schema, Socket.IO, Groq provider, queues, budgets
apps/web      Next.js dashboard (App Router, Tailwind v4, glass components)
packages/shared  Socket event contract, DTOs, enums, constants
docs/architecture.md  Full design: data model, REST + socket contracts, autopilot pipeline
```

## Deploying to a VPS (PM2)

```bash
# on the server (Node 20+)
git clone <repo> && cd zaid-khan
npm install
npm run setup
npm run build

# apps/server/.env
#   NODE_ENV=production
#   AUTH_PASSWORD=<strong password>
#   APP_ENCRYPTION_KEY=<32-byte base64>
#   DATABASE_URL=file:./data/zaidkhan.db

pm2 start apps/server/dist/src/index.js --name zaid-khan-api
pm2 start "npm run start -w @zk/web" --name zaid-khan-web
pm2 save && pm2 startup
```

Put Nginx/Caddy in front of port 3000 (TLS). Keep `pm2` at **instances: 1** — the WhatsApp session is
stateful and must not be sharded. The SQLite file and `data/baileys/` must survive restarts and be
included in backups.

## Roadmap notes

- Session credentials live in `apps/server/data/baileys/` (gitignored) for reliability; a DB-backed auth
  store is a documented later step behind the same interface.
- Socket events are emitted by the server today; the dashboard reads via REST polling until phase 3 adds the
  client socket (Next's rewrite proxy does not upgrade WebSockets reliably, so the socket origin needs its
  own explicit configuration).
- SQLite → PostgreSQL: change the Prisma provider, swap `@prisma/adapter-better-sqlite3` for
  `@prisma/adapter-pg`, regenerate migrations. Documented in `docs/architecture.md`.
