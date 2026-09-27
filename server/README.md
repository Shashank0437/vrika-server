# Vrika API

FastAPI backend for registration approval (**Brevo** email), JWT login, and per-tenant RBAC. Intended to run on **port 8000** with the Next.js client proxying `/be/*` to this service ([`client/next.config.ts`](../client/next.config.ts)).

## Quick start

1. **MongoDB + Redis** (Docker from repo root):

   ```bash
   docker compose up -d
   ```

2. **Python env**:

   ```bash
   cd server
   python3 -m venv .venv
   source .venv/bin/activate   # Windows: .venv\Scripts\activate
   pip install -r requirements.txt
   cp .env.example .env
   # Edit .env — set JWT_SECRET, ADMIN_API_KEY, BREVO_*.
   ```

3. **Run**:

   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

   Open docs: <http://127.0.0.1:8000/docs>

## Transactional email (Brevo)

- Create an API key in [Brevo](https://app.brevo.com) → **SMTP & API** → **API keys** → **`BREVO_API_KEY`** in `.env`.
- **`BREVO_SENDER_EMAIL`** must be an address (or domain) **verified as a sender** in Brevo.
- **`BREVO_SENDER_NAME`** defaults to `Vrika` (display name in inboxes).

The backend calls **POST `https://api.brevo.com/v3/smtp/email`** (`htmlContent` + `textContent`).

Cloud scan notifications use a text-based Vrika wordmark and provider badge, with inline styles and table-based layout. Keep this header image-independent: Gmail does not reliably display base64/data-URI or SVG images, and the Brevo API fallback does not support inline CID images. This template is shared by automated and manually shared Cloud scan notifications.

Cloud report and attack-path emails go to **authorized project members plus all administrators of the same organization**, including manual shares and scheduled reports. Notification requests must include the Cloud `provider_id` UUID. The server resolves the provider's current `vrika-project:*` groups through the signed, read-only Cloud `/internal/vrika-provider-projects` endpoint, then verifies that the project belongs to the linked organization. The local `cloud_provider_ids` list is not authoritative for email routing: providers created directly in Cloud Security may not appear there. Non-admin recipients must have a project role or be on its member roster, and have Cloud Security read access. Organization admins are included without project membership; module-wide access alone does not qualify other users. Pending access changes are excluded, and duplicate addresses are deduplicated. Unassigned/ambiguously assigned providers and projects without eligible recipients block delivery with a logged error (HTTP 409 during preflight); unavailable/unverifiable Cloud assignments return HTTP 503 rather than falling back to cached assignments or all organization users. Project assignment, membership, and admin access are checked again by the sender, including PDF retry attempts.

Compose uses the unique `prowler-api` network alias for `PROWLER_API_BASE_URL`, avoiding the ambiguous `api` hostname shared by the two backends. Deploy the Cloud project-lookup endpoint and network alias before the corresponding server release. Custom deployments must allow that hostname in `DJANGO_ALLOWED_HOSTS` (the Vrika compose override already does).

SMTP connection/authentication keeps a 60-second timeout; message transmission uses `SMTP_SEND_TIMEOUT_SECONDS` (default **300**, positive and at most **900** seconds) so multi-megabyte PDFs are not limited to a one-minute upload. Each message includes a Message-ID. Recipient refusals are reported as failures and are not retried to the entire original list, avoiding duplicate deliveries to recipients already accepted. API `202 Accepted` means the report was queued, not that SMTP or the recipient's inbox confirmed delivery.

## Contact form (marketing site)

- Set **`CONTACT_ADMIN_EMAILS`** to a comma-separated list (e.g. `ops@yourco.com,founder@yourco.com`). Each receives **one multi-recipient send** when someone submits **POST `/contact`**.
- The submitter receives a **thank-you** email separately. If that send fails after admins were notified, the API still returns **200** with `confirmation_sent: false`.

## Flow

1. User submits **POST `/auth/register-request`** (business email, username, company, phone).
2. Admin **POST `/admin/registration-requests/{id}/approve`** with header **`X-Admin-Key: $ADMIN_API_KEY`**. Server emails a completion link to **`FRONTEND_URL/register/complete?token=...`**.
3. User completes **POST `/auth/complete-registration`** → creates **organization** (tenant) + **user** with role **`tenant_admin`**, returns JWT.
4. **POST `/auth/login`** and **GET `/auth/me`** for the session.
5. **POST `/contact`** — public contact form; emails admins + confirmation to the user (requires **`CONTACT_ADMIN_EMAILS`** and Brevo config).

## RBAC

- Users belong to one **organization** (`organization_id` = `tenant_id` in JWT).
- First completed registration gets **`tenant_admin`**. Future invites can assign roles under the same model.

## Health

`GET /health` → `{ "status": "ok" }`
