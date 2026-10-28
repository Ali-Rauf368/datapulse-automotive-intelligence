# DataPulse Combined Final Project

This folder combines the interview-ready package with the signup/login changes and the original sales/service dashboard and API features.

## Included
- React + TypeScript + Vite frontend
- Node.js + Express + TypeScript API
- PostgreSQL database integration
- Email/password login and signup flow
- Secure password hashing and JWT-based authentication in the existing implementation
- Viewer role assigned to new accounts (not admin)
- Vehicle inventory and status KPIs
- Existing sales and service API/dashboard workflows
- Existing analytics, health checks, tests, deployment docs, and Claude Code checklist
- SQL migrations, including the base schema and signup name column

## Important verification note
This archive combines source files; it is not a guarantee that the project has been tested in your local environment. Before presenting it, install dependencies, configure PostgreSQL and environment variables, apply migrations in order, and run build/lint/tests plus a real signup/login test.

## Suggested first steps
1. Read `README.md` and `.env.example`.
2. Configure PostgreSQL and the required environment variables.
3. Review `server/src/migrations/000_base_schema.sql`, `001_analytics_auth.sql`, and `002_user_signup.sql` before running them. Back up any existing database first; don't run the base migration blindly if your existing `vehicles` schema differs.
4. Run `npm ci`, then `npm run build`, `npm run lint`, and `npm test`.
5. Start backend and frontend using the commands in `README.md`.
6. Test signup, login, protected routes, dashboard, sales, and service workflows.

For a guided audit, see `CLAUDE_CODE_CHECKLIST.md` and give its prompt to Claude Code.
