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

### Scoped access

User management assigns multiple **role bindings**, not a flat user/admin flag.
Global means the current organization, never other organizations.

| Role | Scope | Permissions |
| --- | --- | --- |
| Viewer | Global | View web, cloud and administration panels |
| Analyst | Web Security or Cloud Security | View, execute and edit within that module |
| Lead | Project | View, execute, edit and manage project members |
| Admin | Global | All permissions, including `manage_roles` |

Explicit empty bindings remove all access. Existing `tenant_admin` users retain
global Admin access; existing `tenant_member` users retain both module Analyst
bindings. JWT role claims are not authorization: current database bindings are
checked for every authenticated request. Role changes use optimistic versions
and an organization lock, preserve the last Admin and record an audit entry.
Interrupted cross-service changes remain durably pending and are resumed before
the affected user's next authenticated request or the next role update. Until
synchronization succeeds, those requests return an explicit unavailable error.

The Projects page manages project names and team membership; it does not expose
web-session or cloud-account/provider assignment controls. Project selection
uses a custom searchable picker in the existing Web/Cloud header row. New web
sessions can select a project, and Cloud project leads select their project
before adding accounts. Existing API access boundaries are unchanged. Unassigned resources are not
visible to project-only leads. Membership is a roster, not an implicit permission
grant; only `manage_roles` can change bindings. Organization-wide configuration
is not project configuration and remains outside a project lead's scope.

**Project views:** the Web project picker filters Session History, its metrics,
and Recent Chats. It stays available inside an open chat. Selection is saved per
user, organization and module, and is carried in the `project` URL parameter.
Project names on the Projects page open that project's Web history.
**All projects** shows all authorized projects; **Unassigned** includes older
sessions without a project and is available only with module-wide read access.
New scans use the selected project; starting from All projects or Unassigned
leaves a new scan unassigned. Existing sessions are never silently reassigned.
Cloud selection also persists and is forwarded to the existing scoped embed.

The session-list and session-intelligence APIs accept optional
`project_id=<id>` or `project_id=unassigned`. Filtering happens before list limits
and cannot broaden the caller's role scope or organization access. Direct
`GET /workspace/agent-chat/sessions/{id}` supports links to older sessions outside
the recent-list window. Background refresh errors retain the last valid list;
permission-denied responses clear cached results.

The Cloud API synchronizes a per-user managed role through a short-lived
HMAC-signed internal request. Existing cloud access tokens use current bindings,
so removing a role does not wait for token expiry. Native standalone Cloud users
remain on native permissions. Vrika-managed cloud permissions must be changed in
Vrika, not by editing the generated role.

**Deployment order:** deploy Cloud Security API migration
`0103_role_vrika_policy` and API code first, then Vrika API and web. Both bridge
services must share the configured bridge secret (no default secret is accepted).
From `server/`, run `python scripts/migrate_scoped_access.py` to preview, then
`python scripts/migrate_scoped_access.py --apply` to persist compatible bindings
and synchronize already linked cloud accounts. A synchronization error aborts
the operation; do not report a partial deployment as complete. Retain migration
0103 when rolling back binaries, since it is additive.

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
