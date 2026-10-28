# DataPulse — Automotive Intelligence Platform


## Simple user signup and login

The login screen includes a **Create an account** option. New users enter their name, email, and password (minimum 6 characters; maximum 72 UTF-8 bytes). Passwords are hashed with bcrypt before storage, and self-registered users receive the `viewer` role by default. Creating an account does not grant admin or operator permissions.

For a fresh database, apply migrations in numeric order: `000_base_schema.sql`, `001_analytics_auth.sql`, then `002_user_signup.sql`. Migration 000 creates the base `vehicles` table if missing; review its schema before applying it to an existing production database. Configure `JWT_SECRET` to a unique secret of at least 32 characters.

DataPulse is a full-stack automotive inventory and analytics application designed to bring vehicle records, operational visibility, and business intelligence into one authenticated workspace.

It combines a React dashboard with a Node.js API and PostgreSQL-backed data storage. The application provides a foundation for managing vehicle inventory, tracking vehicle status, and expanding sales and service reporting.

**Repository:** https://github.com/Ali-Rauf368/datapulse

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Current Project Status](#current-project-status)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Configuration](#environment-configuration)
- [Running the Application](#running-the-application)
- [Authentication and Authorization](#authentication-and-authorization)
- [Database and Data Model](#database-and-data-model)
- [API and Integrations](#api-and-integrations)
- [Testing and Quality Checks](#testing-and-quality-checks)
- [Security Considerations](#security-considerations)
- [Known Limitations](#known-limitations)
- [Future Improvements](#future-improvements)
- [Contributing](#contributing)

---

## Overview

Automotive businesses need reliable access to inventory, vehicle status, and operational information. DataPulse provides a centralized workspace for viewing this information through a web-based dashboard.

The project focuses on:

- Centralized vehicle inventory.
- Authenticated access to business data.
- Role-aware application access.
- PostgreSQL-backed records.
- Operational analytics for sales and service activity.
- An API layer that separates frontend presentation from backend data access.
- Integration capabilities, including Apache NiFi.

DataPulse is an actively developed portfolio project. Features described as planned or incomplete below should not be considered production-ready.

## Features

### Vehicle Inventory

- View vehicle records retrieved from PostgreSQL through the API.
- Display vehicle names, identifiers, model years, and statuses.
- Distinguish active, sold, and in-service vehicles.
- Search and filter inventory where supported by the current frontend.
- Present inventory totals and status-based KPIs.

### Authentication and Access Control

- Sign in using an account registered with DataPulse.
- Authenticate API requests using bearer tokens.
- Associate users with application roles.
- Support administrator access.
- Require backend permission checks rather than relying exclusively on frontend controls.

### Business Overview

The dashboard presents an overview of vehicle inventory and operational activity, including:

- Total vehicle records.
- Active vehicle count.
- Sold vehicle count.
- Vehicles currently in service.
- Sales activity and recorded revenue, when sales events are available.
- Service activity, when service events are available.
- API and database connection status.

### Database Integration

- Retrieve vehicle records from PostgreSQL.
- Separate API logic from the frontend.
- Expose health-check functionality for service and database connectivity.
- Preserve existing vehicle records during application development.

### Apache NiFi Integration

The project includes NiFi integration work intended to support data movement and integration workflows.

The availability and completeness of individual NiFi flows depend on the current configuration and deployment. A working integration should be verified against the relevant NiFi instance before being treated as production-ready.

---

## Technology Stack

The project includes the following technologies and components:

| Component | Technology |
| --- | --- |
| Frontend | React |
| Frontend language | TypeScript |
| Build and development tooling | Vite |
| Backend runtime | Node.js |
| Backend language | TypeScript |
| API framework | Express |
| Database | PostgreSQL |
| Authentication | Token-based authentication |
| API security | Bearer-token authentication and role checks |
| Data integration | Apache NiFi |

The repository's package files and server configuration are the source of truth for exact dependency versions and available scripts.

---

## Architecture

DataPulse separates its user interface, API, and persistent storage.

```text
┌───────────────────────────────┐
│       Web Browser             │
│                               │
│ React + TypeScript + Vite     │
│ Dashboard and Sign-in         │
└───────────────┬───────────────┘
                │
                │ HTTP / JSON
                │ Bearer token
                ▼
┌───────────────────────────────┐
│       Node.js API             │
│       Express + TypeScript    │
│                               │
│ Authentication                │
│ Authorization                 │
│ Vehicle and analytics routes  │
│ Health checks                 │
└───────────────┬───────────────┘
                │
                │ Database queries
                ▼
┌───────────────────────────────┐
│         PostgreSQL            │
│                               │
│ Vehicle records               │
│ User and role data            │
│ Sales and service events      │
└───────────────────────────────┘

      Apache NiFi integration
      for configured data flows
```

### Request flow

1. A user opens the web application.
2. The user signs in through the authentication API.
3. The frontend uses the authenticated session when requesting protected data.
4. The API validates authentication and enforces the applicable permissions.
5. The API reads or updates data through the database layer.
6. The dashboard displays the API response.

The diagram describes the intended application architecture. Exact route names, database schema, and integration behavior should be verified against the implementation.

---

## Current Project Status

Verified on 28 October 2026 with Node.js 24, npm 11 and PostgreSQL 16:

| Check | Result |
| --- | --- |
| `npm run lint` | Passes |
| `npm run typecheck` (frontend, Vite config and server, `strict` for the server) | Passes |
| `npm run test:isolated` | 93 tests pass (3 suites) on a disposable database |
| `npm run build` | Passes |
| Browser walkthrough (headless Firefox) | Signup, sign-in and sign-out, viewer restrictions, inventory create/edit/search/filter/delete, sales, service status changes, the admin ingestion panel, and the API-down and expired-session states |

Working end to end:

- Self-service signup (always `viewer`), sign-in, session validation, sign-out and expired-session handling.
- Role-based access enforced by the API for admins, operators, viewers and NiFi machine credentials.
- Vehicle inventory backed by PostgreSQL: search, status filter, create, edit and (admin) delete.
- Sales: recording a sale marks the vehicle sold and updates revenue, sales history and the chart.
- Service: jobs move from open to in progress to completed (or cancelled); a vehicle returns to active when its last open job closes.
- KPIs and sales and service analytics computed from database records, with an inventory data check that flags statuses whose history is incomplete.
- Live API and database health in the dashboard, and NiFi ingestion outcomes for admins.

Apache NiFi: the API side (machine credentials, the ingestion endpoint, outcome logging and the admin view) is implemented and tested. A NiFi flow definition is not part of this repository, and no live NiFi deployment has been verified.

---

## Prerequisites

Install the following before setting up DataPulse:

- Git
- Node.js and npm, using versions compatible with the repository
- PostgreSQL
- A terminal and a code editor
- Apache NiFi only if you intend to configure or test the integration workflows

The project has been developed and tested locally with Node.js 24 and npm 11. Other versions should be validated against the package configuration.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/Ali-Rauf368/datapulse.git
cd datapulse
```

If the repository is already cloned, navigate to the project directory instead.

### 2. Install dependencies

```bash
npm ci
```

`npm ci` installs the exact versions recorded in `package-lock.json`. The frontend and API share the root `package.json`.

### 3. Configure PostgreSQL

Create or select a PostgreSQL database and a dedicated database user.

For example, the local development environment has used a database named `datapulse` and a database user named `datapulse_user`.

Use your own local credentials. Do not copy real passwords into this README or commit them to Git.

Ensure the required database tables and schema are initialized using the project's existing database setup process.

### 4. Configure environment variables

Configure the variables required by the backend and frontend before starting the application.

Refer to the actual environment-variable references in the repository. Do not assume that this README defines every required variable.

If an example environment file is available, use it as a starting point and fill in the values for your local environment.

---

## Environment Configuration

Environment variables should be stored in local, untracked environment files rather than committed to source control.

Copy `.env.example` to `.env` and fill in local values:

| Variable | Used by | Purpose |
| --- | --- | --- |
| `PORT` | API | Port to listen on (default `3000`) |
| `FRONTEND_URL` | API | Allowed browser origin (CORS); local Vite ports are also allowed outside production |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | API, scripts | PostgreSQL connection |
| `DATABASE_URL` | API, scripts | Optional connection URL that replaces the `DB_*` values (e.g. Render's External Database URL) |
| `SERVE_FRONTEND` | API | `true` makes the API also serve the built dashboard from `dist/` (set by the Render Blueprint) |
| `JWT_SECRET` | API | Token signing secret, at least 32 characters; the API will not start without it |
| `VITE_API_URL` | Frontend build | API base URL, e.g. `http://localhost:3000/api` (can live in `.env.local`) |
| `NIFI_FLOW_NAME`, `NIFI_CREDENTIAL_NAME` | API, scripts | Optional names for ingestion logs and new machine credentials |
| `TEST_DB_*`, `PG_BIN_DIR` | Tests | Optional test database and PostgreSQL binary location (see Testing) |

### Important

- Never commit `.env`, `.env.local`, database passwords, signing secrets, or access tokens.
- Keep frontend-exposed environment variables free of secrets.
- A variable prefixed with `VITE_` is exposed to frontend code and must not contain private credentials.
- Use different credentials for development, testing, and production.
- Configure the API's allowed origins for the actual frontend URL.

---

## Running the Application

Run the frontend and backend in separate terminal windows.

### Terminal 1: Backend API

From the project root:

```bash
npm run server:dev
```

On startup the API reports:

```text
DataPulse API running at http://localhost:3000
Database connected; schema is up to date
```

If a migration is missing, the second line names the file to apply instead. The API refuses to start without a `JWT_SECRET` of at least 32 characters.

Keep this terminal open while testing the application.

### Terminal 2: Frontend

From the project root:

```bash
npm run dev -- --host 127.0.0.1
```

Open the local URL printed by Vite in your browser. The development environment has previously used:

```text
http://127.0.0.1:5173/
```

The actual port may differ if the default port is occupied.

### Health checks

```text
GET http://localhost:3000/api/health      # API liveness
GET http://localhost:3000/api/health/db   # database readiness (503 when unavailable)
```

The dashboard's System status panel calls both every 30 seconds and shows the API round-trip time.

### Production build

Build the frontend with:

```bash
npm run build
```

A successful frontend build does not, by itself, prove that a production deployment is configured correctly. Production deployment also requires appropriate server, database, authentication, and frontend-origin configuration.

### Deploying to Render

`render.yaml` is a Render Blueprint: in the Render Dashboard choose **New → Blueprint** and select this repository. It creates a free PostgreSQL 16 database and one free web service that builds the dashboard, runs `npm run db:migrate` on every start, and serves the API and the dashboard on one URL (`SERVE_FRONTEND=true`). Render generates `JWT_SECRET` and supplies the database credentials. Create the first administrator from your machine with the database's External Database URL: `DATABASE_URL="<url>" npm run setup:admin`. Step-by-step instructions are in [README-NEW-DEPLOYMENT.md](README-NEW-DEPLOYMENT.md).

---

## Authentication and Authorization

DataPulse uses authenticated API requests for protected workspace data.

The intended access-control model includes:

- User authentication at sign-in.
- Token-based access to protected API routes.
- User roles, including administrator access.
- Server-side authorization checks for protected operations.

### Administrator setup

The repository has included an administrator setup script:

```bash
npm run setup:admin
```

Before running this command in a new environment, inspect its behavior and ensure that the database configuration is correct.

Do not assume that every installation should recreate an administrator account. Use the application's intended account-management process.

### Roles

| Role | Access |
| --- | --- |
| Viewer | Read inventory, sales, service and analytics. Every self-registered account starts here. |
| Operator | Viewer access, plus adding and editing vehicles, recording sales and managing service jobs. |
| Admin | Operator access, plus deleting vehicles and viewing ingestion logs. |
| Machine credential (NiFi) | Read data and add vehicles; no interactive actions. |

The API enforces these checks on every route; the dashboard only hides controls a role cannot use.

### Sessions

- Passwords are hashed with bcrypt; signup ignores any role sent by the client.
- Sign-in returns an HS256 JWT valid for 8 hours. Every request re-checks that the account is still active and reads its current role, so deactivation and role changes apply immediately.
- The dashboard confirms a stored session with `GET /api/auth/me` and returns to the sign-in screen with an explanation when a session expires.
- Logs never include passwords, tokens or request bodies.

There is no user-management screen. Accounts come from signup (viewer) or `npm run setup:admin` (the first administrator). Someone with database access changes a role with:

```bash
npm run setup:role -- <email> <admin|operator|viewer>
```

It refuses to remove the last active administrator. The change applies on the account's next request.

---

## Database and Data Model

PostgreSQL is the persistent data store for the application's vehicle inventory and operational records.

The dashboard has shown data associated with the following conceptual areas:

- Vehicle inventory.
- User accounts and roles.
- Sales events.
- Service events.

These are functional areas, not a substitute for the actual database schema. Refer to the SQL definitions, migrations, or initialization scripts in the repository to determine the exact table names, columns, constraints, and relationships.

### Migrations

Apply the files in `server/src/migrations` in numeric order. They use `IF NOT EXISTS`, so re-running them on a fresh database is safe. There is no migration-tracking table: for an existing database, compare the live schema with each file before applying it. Migration `002_user_signup.sql` is required for signup. On startup the API checks the schema and names any missing migration.

### Inventory status

Vehicles are **Active**, **Sold** or **In service**. Status follows each vehicle's history, and the API enforces it:

- Recording a sale marks the vehicle Sold. A vehicle can be sold once, and not while it has an open service job.
- Opening a service job puts the vehicle In service. When its last open job is completed or cancelled, it returns to Active (unless it has been sold).
- Completed and cancelled jobs are final.
- Vehicles added by people start Active. A manual status edit is only accepted when it matches the vehicle's history; machine ingestion may import an existing status.
- Vehicles with sales or service history cannot be deleted, so that history stays attached.

`GET /api/vehicles/stats` also counts vehicles whose status disagrees with their history (for example, marked Sold before sales were recorded). The dashboard lists them in an "Inventory data check" note. Recording the missing sale, or opening and closing a service job, reconciles them.

### Sales and service reporting

Sales revenue and counts come from recorded sales events, and service metrics from recorded service jobs. When those tables are empty, the dashboard shows an empty state rather than sample data.

### Demo data

`npm run seed:demo` adds 18 vehicles from European-market makes with nine sales over the last four weeks (five of them in the last seven days) and seven service jobs in every status. It follows the same status rules as the API, never changes existing records, and does nothing if the data is already present. Its sales and service rows are tagged `source = 'demo-seed'`, and `npm run seed:demo -- --remove` deletes exactly what it added (keeping any demo vehicle that has since gained other history).

### Development data

The development database contains fixtures from earlier test runs against it: `DataPulseTest Integration` vehicles and `test-machine-*` API credentials. The test suites now refuse to run against any database whose name does not end in `_test`, and they remove everything they create.

---

## API and Integrations

The frontend communicates with the backend through HTTP API requests.

### Endpoints

"Any credential" means a signed-in user or a machine credential. Errors are always JSON (`{"error": "..."}`), including unknown routes (404) and oversized bodies (413).

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | Public | API liveness |
| `GET /api/health/db` | Public | Database readiness (503 when unavailable) |
| `POST /api/auth/register` | Public | Create a viewer account |
| `POST /api/auth/login` | Public | Sign in; returns a JWT valid for 8 hours |
| `GET /api/auth/me` | Signed-in user | Current profile |
| `GET /api/vehicles` | Any credential | List vehicles (`search` and `status` filters) |
| `GET /api/vehicles/stats` | Any credential | Inventory KPIs and data-check counts |
| `GET /api/vehicles/:id` | Any credential | One vehicle |
| `POST /api/vehicles` | Admin, operator, operator machine credential | Add a vehicle |
| `PATCH /api/vehicles/:id` | Admin, operator | Edit a vehicle |
| `DELETE /api/vehicles/:id` | Admin | Delete a vehicle that has no sales or service history |
| `GET /api/sales`, `GET /api/service` | Any credential | Latest 100 sales and service jobs |
| `POST /api/sales` | Admin, operator | Record a sale and mark the vehicle sold |
| `POST /api/service` | Admin, operator | Open a service job and put the vehicle in service |
| `PATCH /api/service/:id` | Admin, operator | Change a service job's status |
| `GET /api/analytics/sales`, `GET /api/analytics/service` | Any credential | Sales and service analytics |
| `GET /api/operations/nifi-logs` | Admin | Recent machine-ingestion outcomes |

### Apache NiFi

Implemented and tested in this repository:

- **Machine credentials.** `npm run setup:nifi-credential` creates an operator-level token, prints it once and stores only its SHA-256 hash.
- **Ingestion endpoint.** NiFi's InvokeHTTP processor sends `POST /api/vehicles` with `Authorization: Bearer <token>` and a JSON vehicle. Valid records return `201`, invalid ones `400` and duplicate VINs `409`.
- **Outcome logging.** Each machine request is recorded in `nifi_request_logs` (outcome, HTTP status, message) without tokens or payload data. Admins see the latest requests in the dashboard's Data ingestion panel.
- **Least privilege.** Machine credentials cannot edit or delete vehicles, record sales or service, or read the logs.

Not included or verified: a NiFi flow definition and a running NiFi instance. Backup and restore of a flow is described in [docs/nifi-backup-restore.md](docs/nifi-backup-restore.md).

To exercise the endpoint without NiFi, send the request NiFi would send (this adds the vehicle):

```bash
curl -X POST http://localhost:3000/api/vehicles \
  -H "Authorization: Bearer $NIFI_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vin":"YV1XZK7V2R2000001","make":"Volvo","model":"XC40 Recharge","model_year":2024}'
```

---

## Testing and Quality Checks

```bash
npm run lint            # ESLint
npm run typecheck       # TypeScript: frontend, Vite config and server
npm run test:isolated   # every test suite on a disposable PostgreSQL; no setup needed
npm run build           # type-check and production frontend build
```

`npm run test:isolated` creates a throwaway PostgreSQL cluster in a temporary directory (loopback only, random password), applies the migrations, runs the suites and deletes the cluster. It needs the PostgreSQL server binaries (`initdb`, `pg_ctl`); set `PG_BIN_DIR` if they are not found automatically.

`npm test` runs the same suites against an existing database whose name ends in `_test`: by default `<DB_NAME>_test` on the server configured in `.env`, or the database given by `TEST_DB_HOST`, `TEST_DB_PORT`, `TEST_DB_NAME`, `TEST_DB_USER` and `TEST_DB_PASSWORD`. Because the suites create and delete rows, they refuse to run against any other database, and they sign tokens with their own random secret. To create a local test database once (as a PostgreSQL superuser):

```bash
sudo -u postgres createdb -O datapulse_user datapulse_test
for migration in server/src/migrations/*.sql; do
  psql -h localhost -U datapulse_user -d datapulse_test -v ON_ERROR_STOP=1 -f "$migration"
done
```

The suites cover:

- **Authentication:** signup (viewer role enforced, client-supplied roles ignored, duplicate and invalid input, bcrypt storage), sign-in, `/api/auth/me`, forged tokens, and read-only access for new accounts.
- **Inventory:** create, read, update and delete, validation, search and filter, role checks, and the status rules.
- **Sales:** recording, duplicate prevention, invalid amounts, open-service conflicts, and reconciling legacy records.
- **Service:** the full status lifecycle, including a regression test for moving a job to in progress, multiple open jobs, and final states.
- **Platform:** NiFi ingestion logging, analytics totals, health checks and JSON error responses.

The CI workflow (`.github/workflows/ci.yml`) applies the migrations to a PostgreSQL 16 service, then runs lint, type-check, tests and the build.

---

## Security Considerations

DataPulse is a development and portfolio project unless and until it has been separately hardened and reviewed for production use.

Before deploying it publicly:

1. Use strong, unique credentials.
2. Rotate any credentials that have been exposed.
3. Keep environment files and secrets out of version control.
4. Configure production CORS origins explicitly.
5. Use HTTPS for production traffic.
6. Validate and sanitize user-controlled input.
7. Apply authorization checks on the server.
8. Review database permissions and network exposure.
9. Configure safe error handling and logging.
10. Audit dependencies and address relevant vulnerabilities.
11. Back up the database and test restoration procedures.
12. Enable appropriate repository security features and secret scanning.

Do not commit database dumps containing private information or production credentials.

---

## Known Limitations

- The development database still contains fixtures from earlier test runs (see [Development data](#development-data)).
- There is no user-management screen; roles are changed with `npm run setup:role`.
- Sign-in has no rate limiting or lockout yet.
- The session token is kept in `localStorage`; an httpOnly cookie would be preferable in production.
- Sales analytics chart the last seven days alongside all-time totals.
- A NiFi flow definition is not included, and no live NiFi deployment has been verified.
- A successful local run does not establish production readiness.

---

## Future Improvements

Potential next steps include:

- Complete vehicle create, update, and delete workflows with backend permission checks.
- Build a dedicated user and role management interface.
- Add validated sales-event and service-event workflows.
- Improve analytics with date ranges, filters, and trend visualizations.
- Add automated integration tests for authentication and database routes.
- Add repeatable database migrations and seed-data management.
- Document NiFi process groups and integration testing.
- Add deployment instructions and health monitoring.
- Improve audit logging, error reporting, and operational observability.

These are potential improvements, not claims that the features already exist.

---

## Contributing

Contributions and suggestions are welcome.

1. Fork the repository or create a development branch.
2. Make a focused change.
3. Run the relevant lint, test, and build commands.
4. Review the changes for accidental secrets or local configuration.
5. Submit a pull request describing the change and its verification.

For significant changes, explain the problem being solved and any impact on the API, database schema, or security model.

---

## Project Information

**Project:** DataPulse — Automotive Intelligence  
**Repository:** https://github.com/Ali-Rauf368/datapulse  
**Primary branch:** `main`  
**Purpose:** Full-stack automotive inventory and analytics portfolio project

For setup, API behavior, database schema, and integration details, the source code and configuration files in this repository remain authoritative.



