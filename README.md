<div align="center">

<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" alt="JavaScript" width="90" />
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cloudflare/cloudflare-original.svg" alt="Cloudflare" width="90" />

# POS Services

**Telegram bot for POS (card reader) device management**
Built on **Cloudflare Workers** + **D1** · Written in modern **JavaScript**

[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Telegram Bot API](https://img.shields.io/badge/Telegram-Bot%20API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge)](#license)

</div>

---

A production-ready, serverless Telegram bot that lets customers browse POS devices, submit purchase and repair requests, and view warranty/contact info — while giving admins a full-featured dashboard for request triage, device management, audit logging, and content personalization.

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database](#database)
- [Deployment](#deployment)
- [Webhook Setup](#webhook-setup)
- [HTTP Endpoints](#http-endpoints)
- [User Flows](#user-flows)
- [Admin Flows](#admin-flows)
- [Security](#security)
- [Observability](#observability)
- [Maintenance](#maintenance)
- [Development](#development)
- [License](#license)

---

## Features

### 👤 User-facing

- **Persian UI** with RTL support and Jalali (Shamsi) dates.
- **Device catalogue** — paginated browsing, images, descriptions, availability.
- **POS purchase requests** — multi-step form with applicant type, nationality, contact, and description.
- **Repair requests** — device + problem-type selection, troubleshooting guides, and escalation to a support ticket.
- **Warranty information** for new and used devices.
- **About / Contact** page with configurable text and image.
- **Inline menus, back-navigation, and edit-in-place screens** — messages mutate rather than pile up.
- **Input validation** for phone numbers, Persian digits, and text limits.

### 🛠️ Admin-facing

- **Dashboard** — aggregate stats: status totals, today, and 7-day rolling counts (Tehran time).
- **Request management** — filter by status, full-text search, per-request detail with tap-to-copy contact info, and one-tap status changes that notify the user.
- **Send notes** to users directly from a request detail screen.
- **Device management** — add / soft-delete / toggle availability, edit descriptions, upload images, manage per-problem guides.
- **Content personalization** — welcome message + image, admin dashboard image, About page, warranty texts, applicant intro / notes.
- **Security panel** — admin roster (Super Admin + up to 9 admins), login log, audit log with per-admin filter.
- **Super Admin role** with a "view as user" mode.
- **In-bot CSV exports** for POS and repair requests (capped at 250 rows).

### ⚙️ Platform

- **Idempotent webhook processing** — deduplicated per `update_id`, with stale-lock recovery.
- **Layered rate limiting** — 30 req/min global per user, plus 5 req/min per user on request submissions.
- **Session state** with bounded history for Back navigation.
- **Media reuse via a private Telegram channel** — uploaded images are re-hosted so the bot owns a durable `file_id`.
- **Unicode-safe truncation** — button labels never split ZWJ emoji sequences.
- **Button fallback** — if Telegram rejects a `reply_markup` (e.g. older client without `copy_text`), it retries with a simplified keyboard instead of failing.
- **CSV injection hardening** and **HTML escaping** throughout.
- **Constant-time token comparison** for all HTTP auth.
- **Super Admin alerts** when a burst of failures is detected (5+ failed updates in 5 minutes).
- **Scheduled cleanup** via cron — updates, sessions, audit logs, login logs, rate limits.

---

## Architecture

```
┌──────────────────┐       HTTPS         ┌──────────────────────────┐
│  Telegram Bot    │  ───────────────▶   │   Cloudflare Worker      │
│  API             │  ◀───────────────   │   (src/index.js)         │
└──────────────────┘   webhook + API     └────────────┬─────────────┘
                                                      │
                                                      │ D1 binding
                                                      ▼
                                        ┌──────────────────────────┐
                                        │  Cloudflare D1 (SQLite)  │
                                        │  - sessions              │
                                        │  - devices               │
                                        │  - pos_requests          │
                                        │  - repair_requests       │
                                        │  - settings, users, ...  │
                                        └──────────────────────────┘

┌──────────────────┐
│  Private Channel │  ← re-hosts uploaded photos (bot-owned file_id)
└──────────────────┘
```

Every incoming update is:

1. Verified against `TELEGRAM_WEBHOOK_SECRET`.
2. Deduplicated via `processed_updates`.
3. Routed by role (`superadmin` / `admin` / `user`) to the matching handler.
4. Recorded as `completed` or `failed` for retry-safe processing.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | [Cloudflare Workers](https://workers.cloudflare.com/) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) |
| Language | JavaScript (ES Modules) |
| Bot API | Telegram Bot API |
| CLI | [Wrangler v3](https://developers.cloudflare.com/wrangler/) |
| Scheduling | Cloudflare Cron Triggers |

**No external runtime dependencies.** The only `devDependency` is Wrangler.

---

## Project Structure

```
.
├── src/
│   ├── index.js          # Worker entry — HTTP router, webhook, cron
│   ├── telegram.js       # Bot API client, retries, unified screen renderer
│   ├── db.js             # D1 helpers — queries, sessions, idempotency, rate limits
│   ├── auth.js           # Role resolution, audit + login logging, alerts
│   ├── user.js           # User flows (catalogue, POS, repair, warranty, about)
│   ├── admin.js          # Admin dashboard and all admin flows
│   └── utils.js          # Constants, keyboards, HTML escaping, Jalali dates
├── migrations/
│   └── 0001_initial.sql
├── wrangler.toml         # (gitignored) — real Worker configuration
├── wrangler.toml.example # Template for new installs
├── CHANGELOG.md
├── package.json
├── README.md
└── README.fa.md
```

---

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) with **Workers** and **D1** enabled.
- [Node.js](https://nodejs.org/) **18+** and npm.
- A **Telegram bot** created via [@BotFather](https://t.me/BotFather) — save the token.
- A **private Telegram channel** (the bot must be an admin) to host uploaded images.
- Your Telegram **user ID** (e.g. via [@userinfobot](https://t.me/userinfobot)) for `SUPER_ADMIN_ID`.

---

## Installation

```bash
# 1. Clone the repository
git clone <your-repo-url> pos-services
cd pos-services

# 2. Install dev dependencies (Wrangler)
npm install

# 3. Log into Cloudflare
npx wrangler login

# 4. Create the D1 database
npx wrangler d1 create pos-services-db
# Copy the printed database_id into wrangler.toml
```

Then set up `wrangler.toml` (see [Configuration](#configuration)) and apply migrations:

```bash
npm run db:migrate
```

---

## Configuration

### `wrangler.toml`

Copy `wrangler.toml.example` to `wrangler.toml` and fill in the placeholders:

```toml
name = "pos-services"
main = "src/index.js"
compatibility_date = "2024-11-01"
workers_dev = true

[vars]
PUBLIC_WEBHOOK_URL = "https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/telegram/webhook"
DROP_PENDING_UPDATES = "false"

[[d1_databases]]
binding = "DB"
database_name = "pos-services-db"
database_id = "<YOUR-DATABASE-UUID>"
migrations_dir = "migrations"

[triggers]
crons = ["0 3 * * *"]   # daily cleanup at 03:00 UTC (06:30 Tehran)

[observability]
enabled = true
```

### Secrets

Never put secrets in `wrangler.toml`. Use `wrangler secret put` instead:

| Secret | Purpose |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot API token from BotFather. |
| `TELEGRAM_WEBHOOK_SECRET` | Random string; Telegram echoes it in `X-Telegram-Bot-Api-Secret-Token`. |
| `WEBHOOK_SETUP_TOKEN` | Bearer/header/query token protecting `/setup-webhook` and `/webhook-info`. |
| `SUPER_ADMIN_ID` | Your Telegram user ID. Grants Super Admin role automatically. |
| `PRIVATE_CHANNEL_ID` | Channel ID (format `-100...`) where uploaded photos are re-hosted. |

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put WEBHOOK_SETUP_TOKEN
npx wrangler secret put SUPER_ADMIN_ID
npx wrangler secret put PRIVATE_CHANNEL_ID
```

> Generate strong random values, e.g. `openssl rand -hex 32`.

---

## Database

The schema lives in `migrations/0001_initial.sql` and creates:

| Table | Purpose |
|---|---|
| `admins` | Admin roster (name, Telegram ID, role, active flag). |
| `users` | Cached Telegram users (with `view_as_user` for Super Admin). |
| `devices` | POS device catalogue (soft-deletable, with image + availability). |
| `troubleshooting_guides` | Per-device, per-problem guide text. |
| `pos_requests` | Purchase requests. |
| `repair_requests` | Repair tickets. |
| `settings` | Single-row configuration. |
| `sessions` | Multi-step form state, keyed by Telegram ID. |
| `audit_logs` | Admin action trail. |
| `login_logs` | Admin `/start` history (throttled to 1 per 5 min). |
| `processed_updates` | Webhook idempotency. |
| `rate_limits` | Fixed-window counters (global + per-action). |

All tables use `STRICT` mode and `CHECK` constraints mirroring the application enums.

### Applying migrations

```bash
npm run db:migrate         # remote D1 (production)
npm run db:migrate:local   # local Miniflare
```

---

## Deployment

```bash
npm run deploy   # deploy the Worker
npm run tail     # stream live logs
```

After deploying, note the `workers.dev` URL Wrangler prints — use it as the base for `PUBLIC_WEBHOOK_URL`.

---

## Webhook Setup

Once the worker is deployed and secrets are set, register the webhook with Telegram. You can do it **entirely from a browser** — no `curl`, no CLI.

### 🔗 Browser (recommended)

Open your browser and navigate to:

```
https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/setup-webhook?token=<WEBHOOK_SETUP_TOKEN>
```

The Worker responds with JSON confirming the registration:

```json
{
  "ok": true,
  "webhook_url": "https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/telegram/webhook",
  "allowed_updates": ["message", "callback_query"]
}
```

To verify the current webhook state:

```
https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/webhook-info?token=<WEBHOOK_SETUP_TOKEN>
```

> **Tip:** Save both links as browser bookmarks (or a password-manager entry) so re-registering the webhook after rotating secrets is one click away.

### 🧪 Terminal (alternative)

```bash
# Register
curl -X POST "https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/setup-webhook" \
  -H "Authorization: Bearer $WEBHOOK_SETUP_TOKEN"

# Verify
curl "https://pos-services.<YOUR-SUBDOMAIN>.workers.dev/webhook-info" \
  -H "Authorization: Bearer $WEBHOOK_SETUP_TOKEN"
```

### ✅ Confirm it works

Send `/start` to your bot from the account registered as `SUPER_ADMIN_ID`. You should get the dashboard directly (or the role chooser if you're in view-as-user mode).

> **Security:** The token in a query string can appear in browser history, referrers, and server logs. Only use the browser link on a trusted device, and **rotate `WEBHOOK_SETUP_TOKEN`** afterwards if you used it on a shared machine.

---

## HTTP Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Liveness + D1 probe. Returns `{ ok, db: "up"\|"down", ts }`. Returns 503 when the DB is unreachable. |
| `GET`/`POST` | `/setup-webhook` | `WEBHOOK_SETUP_TOKEN` | Registers the Telegram webhook. |
| `GET`/`POST` | `/webhook-info` | `WEBHOOK_SETUP_TOKEN` | Proxies `getWebhookInfo`. |
| `POST` | `/telegram/webhook` | `TELEGRAM_WEBHOOK_SECRET` | Telegram update receiver. |
| `*` | anything else | — | Returns a short status string. |

> **Note:** CSV exports are handled **inside the admin bot** (button `📥 دانلود CSV`, max 250 rows per request). The legacy HTTP endpoints `/export/pos.csv` and `/export/repair.csv` have been removed in v1.0.1 to stay within the Cloudflare Workers free-plan CPU budget.

Authorization for setup endpoints accepts **any** of:

- `Authorization: Bearer <token>`
- `X-Webhook-Setup-Token: <token>`
- `?token=<token>` query parameter

---

## User Flows

### Main menu

```
🏠 Home
├── 💳 Device catalogue           → paginated list → device detail → request
├── 🛒 Request a POS device       → applicant type → nationality / intro → form
├── 🛠️ Support & repair           → device → problem → guide → escalate
├── 🛡️ Services & warranty        → new / used
└── 📞 About / Contact
```

### POS request flow

```
Device selected
   └── Applicant type (individual | legal)
         ├── individual → nationality (Iranian | Foreign) → note → name → phone → description
         └── legal      → intro → name → company → phone → description
                                                                  └── submit + notify admins
```

### Repair flow

```
Device selected → problem type → troubleshooting guide
                                     ├── "Resolved" → home
                                     └── "Request support" → name → phone → description → submit
```

Both submission flows include:

- Per-user rate limit (5 / minute).
- Duplicate detection via `source_update_id` and a 10-minute pending window.
- Admin broadcast via `ctx.waitUntil` (non-blocking).
- Friendly error message on any generic D1 failure.

---

## Admin Flows

```
🏠 Admin dashboard
├── 📊 Stats (status totals, today, 7 days)
├── 🛒 POS requests       → filter, search, detail, status, note, CSV
├── 🛠️ Repair requests    → filter, search, detail, status, note, CSV
├── 💳 Device management  → add / edit / toggle / image / guides / soft-delete
├── ⚙️ Security           → admins, login log, audit log (per-admin filter)
└── 🎨 Personalization    → welcome, about, warranties, applicant texts
```

### Role model

| Role | Capabilities |
|---|---|
| `user` | All end-user flows only. |
| `admin` | Full dashboard except admin management and Super Admin identifiers. |
| `superadmin` | Everything, plus "view as user" toggle and access to sensitive IDs. |

- The Super Admin is defined solely by the `SUPER_ADMIN_ID` secret — no DB row required.
- The `a:rolechooser` button appears only for the Super Admin.
- Non-Super viewers see Super Admin Telegram IDs as `🔒 مخفی` in logs.
- Maximum **9 admins** in the `admins` table (plus the implicit Super Admin = 10 total).

---

## Security

| Area | Mitigation |
|---|---|
| **Secret storage** | All secrets via `wrangler secret`; `wrangler.toml` is gitignored. |
| **Webhook auth** | `X-Telegram-Bot-Api-Secret-Token` verified with constant-time comparison. |
| **Setup auth** | Bearer, header, or `?token=` — all constant-time compared. |
| **Timing attacks** | `constantTimeEqual` used for every token comparison. |
| **HTML injection** | All text passed through `esc()` before rendering with `parse_mode: "HTML"`. |
| **CSV injection** | Cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` prefixed with `'`. |
| **Rate limiting** | 30/min global, 5/min on submissions. |
| **Idempotency** | `processed_updates` with stale-lock recovery (2-minute window). |
| **Input validation** | Phone normalization (ASCII digits only), length caps, ID format checks. |
| **PII handling** | `safeError()` never logs request payloads — only message + Telegram code. |
| **Security headers** | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. |
| **Private chats only** | Group/channel messages are dropped before processing. |
| **Failure alerting** | Burst of failed updates triggers a Super Admin notification. |

> **Query-string tokens** (for browser-based setup) are a deliberate trade-off: convenient but visible in history/logs. Rotate `WEBHOOK_SETUP_TOKEN` after using a shared device.

---

## Observability

- **`[observability]`** enabled — structured logs appear in the Cloudflare dashboard.
- **`npm run tail`** streams live logs from the deployed Worker.
- **`/health`** returns `503` when D1 is unreachable — point external monitors here.
- **`processed_updates`** records the last error for every failed update.
- **`audit_logs`** capture every admin mutation with actor, action, target, details.
- **`login_logs`** record admin `/start` events (throttled).
- **Super Admin alerts** fire automatically on failure bursts.

---

## Maintenance

### Scheduled cleanup

A cron trigger runs daily at **03:00 UTC (06:30 Tehran)** and prunes:

| Table | Retention |
|---|---|
| `processed_updates` (completed) | 7 days |
| `processed_updates` (failed) | 30 days |
| `processed_updates` (stuck `processing`) | 1 day |
| `sessions` | 2 days |
| `audit_logs` | 90 days |
| `login_logs` | 90 days |
| `rate_limits` | 1 day |

Retention windows are configurable via `cleanupOldRows()` in `src/db.js`.

### Adding a migration

```bash
# Create migrations/0002_your_change.sql, then:
npm run db:migrate
```

### Rotating secrets

```bash
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
# Then re-open the /setup-webhook browser link so Telegram picks up the new secret_token
```

---

## Development

```bash
npm run dev                # start local Miniflare + D1
npm run db:migrate:local   # apply migrations locally
npm run deploy             # deploy to Cloudflare
npm run tail               # stream production logs
```

### Available scripts

| Script | Description |
|---|---|
| `npm run dev` | Start `wrangler dev` (local Miniflare + D1). |
| `npm run deploy` | Deploy the Worker. |
| `npm run tail` | Tail live logs from the deployed Worker. |
| `npm run db:migrate` | Apply migrations to the remote D1. |
| `npm run db:migrate:local` | Apply migrations to the local D1. |

### Testing the bot locally

1. Run `npm run dev`.
2. Expose the local port via a tunnel (e.g. `cloudflared tunnel --url http://localhost:8787`).
3. Point `PUBLIC_WEBHOOK_URL` at the tunnel URL.
4. Open `https://<TUNNEL-URL>/setup-webhook?token=<WEBHOOK_SETUP_TOKEN>` in your browser.

> **Tip:** During local development you can safely set `DROP_PENDING_UPDATES = "true"` to discard the backlog Telegram accumulated while the worker was offline.

---

## License

This project is proprietary. All rights reserved.
