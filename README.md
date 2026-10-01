# spxbarista_bk

Express + MongoDB + Socket.IO API for the coffee office.

## Local

```bash
cp .env.example .env.local
# edit MONGODB_URI, JWT_SECRET, CORS_ORIGIN
npm install
npm run seed
npm run dev
```

Default: `http://localhost:4000` · Health: `GET /health`

| PIN | Role |
|-----|------|
| 11 | Administrator |
| 12 | Manager |
| 21 / 22 | Barista |
| 31 / 32 | User |

## Environment

See [.env.example](.env.example).

| Variable | Notes |
|----------|--------|
| `MONGODB_URI` | Atlas or local Mongo |
| `JWT_SECRET` | Strong secret in production (not `dev-…`) |
| `CORS_ORIGIN` | Comma-separated frontend origins (include Vercel URL in prod) |
| `PORT` / `API_PORT` | Render sets `PORT`; locally use `API_PORT=4000` |

In development, any `localhost` / `127.0.0.1` origin is also allowed for Vite ports.

## Deploy to Render

1. New **Web Service** from GitHub `yeamft/spxbarista_bk` (or use [render.yaml](render.yaml)).
2. Build: `npm install` · Start: `npm start`.
3. Set env:
   - `NODE_ENV=production`
   - `MONGODB_URI`
   - `JWT_SECRET` (strong random)
   - `CORS_ORIGIN=https://<your-app>.vercel.app`
4. Deploy, then open `https://<service>.onrender.com/health`.
5. Seed once (Render Shell): `npm run seed`.
6. Put the Render URL into Vercel `VITE_API_URL` / `VITE_SOCKET_IO_URL` and redeploy the client.

**Must be a Web Service** (not a static site or cron-only worker) so Socket.IO stays connected. Free tier sleeps when idle; first request after sleep can take ~30–60s.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Watch mode |
| `npm start` | Production start |
| `npm run seed` | Users + stations + categories + menu |
| `npm run seed:users` | Users only |
