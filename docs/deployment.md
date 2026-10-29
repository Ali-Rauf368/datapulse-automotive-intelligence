# Deploying DataPulse

This copy of DataPulse adds sales and service workflows and self-service signup. Deploy it to its own GitHub repository and its own Render services and database, so the existing DataPulse deployment is not affected.

## Features added

- `GET /api/sales`: latest 100 recorded sales (authenticated)
- `POST /api/sales`: admin/operator only; locks the vehicle, records the sale and marks the vehicle sold in one transaction. A vehicle can be sold once, and not while it has an open service job.
- `GET /api/service`: latest 100 service jobs (authenticated)
- `POST /api/service`: admin/operator only; opens a service job and marks the vehicle in service
- `PATCH /api/service/:id`: admin/operator only; moves a job between open and in progress, or closes it as completed or cancelled (closed jobs are final). The vehicle returns to active when its last open job closes.
- Dashboard forms and recent-record lists for sales and service jobs
- Self-service signup with name, email and a password of 6–72 bytes; new accounts are always viewers

Migrations 000, 001 and 002 define the base, sales/service/auth and signup schema. `npm run db:migrate` applies them in order and is safe to re-run.

## Local setup

1. Install Node.js 24 (npm 11).
2. Copy `.env.example` to `.env` and set the database credentials and a unique `JWT_SECRET` of at least 32 characters.
3. Create a PostgreSQL database, then run `npm ci` and `npm run db:migrate`.
4. Create the first administrator with `npm run setup:admin`. Others sign up from the login screen as viewers; change a role with `npm run setup:role -- <email> <admin|operator|viewer>`.
5. Start `npm run server:dev` and `npm run dev` in two terminals.
6. Optional: `npm run seed:demo` adds demo vehicles with sales and service history.

## New GitHub repository

1. On github.com create a new, empty repository (no README, licence or `.gitignore`).
2. From this folder (already a Git repository with the code committed), in the VS Code terminal so VS Code can handle the GitHub sign-in:

   ```bash
   git remote add origin https://github.com/YOUR-ACCOUNT/YOUR-REPOSITORY.git
   git push -u origin main
   ```

   Alternatively use **Source Control → Publish Branch** in VS Code, which creates the repository for you.

`.env`, `.env.local`, `node_modules` and `dist` are git-ignored. Never commit passwords, tokens, database exports or production data.

## New Render services (Blueprint)

`render.yaml` describes the whole deployment: one free PostgreSQL database and one free web service in Frankfurt. The web service builds the dashboard, applies the migrations on every start and serves the API and the dashboard on the same URL, so no CORS or API URL settings are needed. Render generates `JWT_SECRET` and wires the database credentials.

1. In the Render Dashboard choose **New → Blueprint**, connect your GitHub account if asked, and select the repository.
2. Review the two resources and click **Apply**. The first build and deploy takes a few minutes.
3. Open the service URL (`https://datapulse-automotive….onrender.com`); `/api/health/db` should report `connected`.

Create the first administrator from your own machine using the database's **External Database URL** (Render Dashboard → the database → Connect). Reading it with `read -s` keeps it out of your shell history:

```bash
read -rsp 'Render External Database URL: ' RENDER_DB; echo
DATABASE_URL="$RENDER_DB" npm run setup:admin
DATABASE_URL="$RENDER_DB" npm run seed:demo        # optional demo data
```

Or sign up on the deployed site and promote that account: `DATABASE_URL="$RENDER_DB" npm run setup:role -- you@example.com admin`.

Free web services sleep after a period without traffic, so the first request afterwards can take about a minute; open the site shortly before a demo. Free databases have an expiry date, shown in the Render Dashboard.

## Validation

Lint, type-check, the production build and the 93-test suite pass (`npm run test:isolated` runs the suite on a disposable PostgreSQL). The Blueprint's build and start commands were exercised end to end from a clean clone against an empty PostgreSQL 16 database.
