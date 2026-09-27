# Vrika

Monorepo with a **Next.js** client (`client/`) and **FastAPI** API (`server/`), backed by **MongoDB** and **Redis**.

## Dashboard UI

The shared dashboard background uses a precompressed WebP, preloaded with a small
inline blur placeholder and an immediate CSS gradient. It covers the viewport
beside the sidebar even on tall pages and remains in place while scrolling.
The static import gives it a content-hashed URL for caching; the original
`client/public/bg.png` is the design source, not the runtime download.

Session History exposes four actions: **Command CTL**, **AI Analysis**,
**Terminal**, and **PDF Report**. Command CTL combines the former description,
target, and overflow buttons into one keyboard-accessible dialog with overview
and report, targets and tools, findings, and activity tabs. Evidence is expandable
without truncation, and all recorded activity is accessible. Generating a PDF
also downloads it; closing an analysis panel does not cancel the running analysis.

Dashboard browser regressions use synthetic API responses and do not execute
scans. In `client/`, run `npm ci`, `npx playwright install chromium`,
`npm run build`, then `npm run test:ui`.
To run the same mocked checks against a deployed frontend, set
`PLAYWRIGHT_BASE_URL` to its origin. For a self-signed test deployment only, set
`PLAYWRIGHT_IGNORE_HTTPS_ERRORS=1`.

## Run everything with Docker Compose

The Cloud Security bridge provisions `admin` with ordinary and exception triage
permissions, and `vrika_member` with ordinary status/note editing only. Existing
managed roles are upgraded by the Cloud Security `0100_triage_managed_roles`
migration; embed login does not reset customized role permissions. Deploy the
matching Cloud Security API schema before the bridge update. Triage is separately
feature-gated in Cloud Security and does not create additional email notifications.

From the repository root:

1. Copy the API example env file and set secrets (at minimum **`JWT_SECRET`**):

   ```bash
   cp server/.env.example server/.env
   ```

2. Build and start **MongoDB**, **Redis**, the **API** (`api`), and the **web** app (`web`):

   ```bash
   docker compose up --build
   ```

3. Open the app:

   - **Frontend**: [http://localhost:3000](http://localhost:3000)
   - **API docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

The browser talks to the API via **same-origin** paths: Next.js rewrites `/be/*` to the Python service (`PY_API_URL` / `INTERNAL_API_URL` inside Compose point at `http://api:8000`).

### Ports

| Service | Port |
|--------|------|
| Web (Next.js) | 3000 |
| API (FastAPI) | 8000 |
| MongoDB | 27017 |
| Redis | 6379 |

### Configuration

- **`server/.env`**: secrets and optional overrides loaded by the `api` service (`JWT_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS`, Brevo, etc.). **`MONGODB_URI`** and **`REDIS_URL`** are overridden in `docker-compose.yml` for the `api` container so they use the Compose service names `mongo` and `redis` (your `127.0.0.1` values in `server/.env` are fine for local-only runs but are not used for those two keys when running the full stack in Docker).
- **`FRONTEND_URL` / `CORS_ORIGINS`**: When you deploy behind a real hostname or TLS, set these to the **public** origin users use (for example `https://app.example.com`).

### Images

- **`server/Dockerfile`**: Python 3.12, `uvicorn app.main:app`.
- **`client/Dockerfile`**: multi-stage Next.js **standalone** production image.

Ignore lists for build context: **`server/.dockerignore`**, **`client/.dockerignore`**.

### Local development without Docker for app code

You can still run **only** MongoDB and Redis via Compose, then run the API and Next dev servers on the host. See [`server/README.md`](server/README.md).
