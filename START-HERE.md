# DataPulse — Start Here (Interview Preparation)

## What to open first

1. Download and extract this ZIP.
2. Open the extracted `datapulse` folder in **VS Code**.
3. Open the **Claude Code** panel inside VS Code (Ctrl+Shift+P → `Claude Code: Open in New Tab`, or choose the Claude Code command available in your installed extension).
4. Give Claude the audit prompt below. Review its proposed changes and command permissions before approving them.
5. Run the checks and start the app only after configuring PostgreSQL and environment variables.

## Claude Code audit prompt

> Audit this complete DataPulse repository before changing code. Read README.md, README-NEW-DEPLOYMENT.md, .env.example, package.json, all migrations, frontend authentication screens, API routes, and the NiFi integration. First list what exists, what is incomplete, and what is broken. Then make the smallest safe changes needed to make signup/login, PostgreSQL connectivity, inventory, dashboard, and sales/service workflows work end to end. Keep new accounts in the viewer role; do not bypass authentication or grant admin access. Do not overwrite existing database records or run destructive migrations. Run `npm ci`, `npm run build`, `npm run lint`, and `npm test`; report exact output and fix reproducible failures. Verify a real signup/login flow against a configured test database. Clearly label Apache NiFi integration as unverified unless a real configured flow can be tested. Do not claim a feature or test works without evidence.

## Ubuntu setup

Prerequisites: compatible Node.js/npm and PostgreSQL. The repository has previously used Node.js 22+; use the version compatible with package.json and the lockfile.

1. In VS Code, open **Terminal → New Terminal** at the repository root.
2. Inspect `.env.example`, then create your local environment file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your local PostgreSQL connection details and a strong, unique `JWT_SECRET`. Never commit `.env` or expose secrets in `VITE_` variables.
4. Inspect `server/src/migrations/000_base_schema.sql`, `001_analytics_auth.sql`, and `002_user_signup.sql` first. Back up any existing database. For a **new empty database named `datapulse`**, apply them in order:

   ```bash
   psql -d datapulse -f server/src/migrations/000_base_schema.sql
   psql -d datapulse -f server/src/migrations/001_analytics_auth.sql
   psql -d datapulse -f server/src/migrations/002_user_signup.sql
   ```

   If the database is not empty or uses a different existing `vehicles` schema, do not blindly run the base migration; ask Claude to compare the SQL with the actual schema first.
5. Install dependencies:

   ```bash
   npm ci
   ```

6. Run checks:

   ```bash
   npm run build
   npm run lint
   npm test
   ```

7. Create the first administrator only if required by the existing setup flow, after reviewing the script:

   ```bash
   npm run setup:admin
   ```

8. Start the backend in one terminal:

   ```bash
   npm run server:dev
   ```

9. Start the frontend in a second terminal:

   ```bash
   npm run dev -- --host 127.0.0.1
   ```

10. Open the URL Vite prints. Test signup, log in with that account, and verify inventory/dashboard data. Check API health at `http://localhost:3000/api/health` and database health at `http://localhost:3000/api/health/db` if those endpoints are available.

## Honest status

This archive contains project source, docs, signup/login implementation, database migrations, and a Claude audit checklist. A complete install/build/test run and real database-backed signup/login test have **not** been verified in the packaging environment. Do not present the project as fully verified until the checks above pass. Apache NiFi flows require a configured NiFi instance and end-to-end verification.
