# Deployment

## Read this first: Vercel can host the dashboard, not the WhatsApp engine

| Part | Runs on Vercel? | Why |
| --- | --- | --- |
| `apps/web` (Next.js dashboard) | ✅ Yes | Stateless SSR/static. |
| `apps/server` (Express + Socket.IO + Baileys) | ❌ No | Needs a **long-lived process**: the WhatsApp Web socket stays open for days, session credentials are files, SQLite is a local file, and the AI queue/retry timers live in memory. Vercel functions are short-lived, ephemeral and read-only apart from `/tmp`. |
| **"Start the session / scan QR"** | ❌ No | Every function invocation would be a different process, so the linked session would not survive. |

So a Vercel-only deployment gives you a login screen that cannot talk to anything. The working
arrangement is **UI on Vercel + API on a persistent host**, or **everything on one VPS**.

---

## Option A — Dashboard on Vercel, API on a container host (recommended if you want Vercel)

### 1. Host the API somewhere persistent

Any of these work because they keep one process alive and give you a disk:

- **Render** → Web Service (Node), add a **Persistent Disk** mounted at `/data`, start command
  `node apps/server/dist/src/index.js`.
- **Railway / Fly.io** → same idea; Fly needs a volume for `data/`.
- **Your own VPS** → the PM2 recipe in the main README (simplest, and WebSockets just work).

Environment for the API:

```env
NODE_ENV=production
PORT=4000
AUTH_PASSWORD=<strong password>
APP_ENCRYPTION_KEY=<32-byte base64>
DATABASE_URL=file:/data/zaidkhan.db     # path on the mounted disk
WEB_ORIGIN=https://<your-vercel-app>.vercel.app
```

Build/run:

```bash
npm install
npm run setup          # shared build + prisma generate + migrate
npm run build -w @zk/server
node apps/server/dist/src/index.js
```

Put it behind HTTPS (the host usually does this) and note the public URL, e.g.
`https://zaid-khan-api.onrender.com`.

### 2. Point the Vercel project at `apps/web`

In the Vercel project that is connected to this GitHub repo:

| Setting | Value |
| --- | --- |
| Framework preset | Next.js (auto-detected) |
| **Root Directory** | `apps/web` |
| Install Command | from `apps/web/vercel.json` (`cd ../.. && npm install --workspace @zk/web --include-workspace-root`) |
| Build Command | from `apps/web/vercel.json` (`cd ../.. && npm run build:shared && npm run build -w @zk/web`) |
| Output Directory | default (`.next`) |

> The `vercel.json` in `apps/web` exists so you do **not** have to type the monorepo commands by hand.
> It deliberately installs only the web workspace, so Vercel never has to compile the native
> `better-sqlite3` module.

### 3. Set the proxy target (required)

In **Vercel → Project → Settings → Environment Variables**:

```
API_PROXY_TARGET = https://<your-api-host>
```

`apps/web/next.config.ts` rewrites `/api/*` and `/socket.io/*` to this origin, so the browser only ever
talks to your Vercel domain and the session cookie stays first-party. **Set it for Production,
Preview and Development** and redeploy after changing it (rewrites are compiled at build time).

If you forget this, the dashboard loads but login fails — that is the missing env var, not a bug.

### 4. Verify

1. Open `https://<app>.vercel.app/login` → sign in with `AUTH_PASSWORD`.
2. Dashboard should show `AI ready` / `No API key` and the WhatsApp status chip.
3. Settings → Groq key → model list loads → **Test** returns a latency.
4. `curl https://<app>.vercel.app/api/health` should return `{"ok":true,...}` (forwarded by the rewrite).

---

## Option B — Everything on one VPS (fewer moving parts)

This is what the main README documents: Nginx/Caddy + PM2, `instances: 1`, with `apps/server/data`
(and later `data/baileys/`) on the same disk as the API. Keep the SQLite file and Baileys credentials
in the backup set.

Why `instances: 1`: the WhatsApp session and the AI queues are process-local. Two workers would mean two
WhatsApp sockets and duplicated replies.

---

## Known limitations of the split (UI on Vercel)

1. **WebSockets do not pass through Vercel rewrites.** Until phase 3, the dashboard polls REST, so this
   is fine today. When the live chat socket lands, either expose the API origin directly to the browser
   (add CORS + a token-based socket auth) or host the dashboard next to the API on the VPS.
2. **The API host must be always-on.** Free container tiers sleep; a sleeping API means the WhatsApp
   session drops and the dashboard shows connection errors.
3. **SQLite must live on a persistent disk**, never in `/tmp` or inside the container image.
4. **Two secrets sets**: the API holds `AUTH_PASSWORD`/`APP_ENCRYPTION_KEY`; Vercel only needs
   `API_PROXY_TARGET`. Never put the Groq key in Vercel — it is stored encrypted in the API database.
