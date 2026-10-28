# Interview-day verification with Claude Code

Open this folder as the VS Code workspace, open Claude Code, and paste the prompt below. Let Claude inspect before it edits. Review diffs before accepting broad changes.

## Prompt

You are helping me prepare this existing DataPulse project for a job interview tomorrow. Work in the current repository; do not rewrite it from scratch. First inspect README.md, package.json, frontend auth form, server auth routes, migrations, and CI workflow. Make a concise plan, then implement only necessary fixes.

Requirements:
- Signup uses name, email, and a simple password (6–72 UTF-8 bytes); login uses email/password.
- Passwords are hashed with bcrypt; new users always get viewer role. Never make signup an admin bypass.
- Apply SQL migrations in numeric order (000, 001, 002) to a fresh local database. Preserve existing data.
- Check that the frontend calls the correct API URL and that signup/login responses are handled correctly.
- Add automated tests for signup success, duplicate email, invalid input, login success/failure, and viewer permissions where practical.
- Run `npm ci`, `npm run build`, `npm test`, and `npm run lint`. Fix reproducible failures and rerun them. Do not claim a command passed unless you ran it and saw it pass.
- If PostgreSQL or network access is unavailable, state exactly what could not be tested and give me the exact commands to test locally. Never invent credentials or put secrets in source control.
- At the end, list files changed, tests actually run and their results, and precise local startup instructions.

Do not delete features or sample assets just to make tests pass. Do not suppress TypeScript/lint errors without explaining why.

## Local verification checklist

- [ ] `npm ci` completes successfully.
- [ ] PostgreSQL is running and `.env` points to a local DataPulse database.
- [ ] `JWT_SECRET` is unique and at least 32 characters.
- [ ] Migrations 000, 001, and 002 apply successfully in order.
- [ ] `npm run build` passes.
- [ ] `npm test` passes against a disposable test database.
- [ ] `npm run lint` passes.
- [ ] Backend starts with `npm run server:dev` and `/api/health` returns `status: ok`.
- [ ] Frontend starts with `npm run dev`.
- [ ] A fresh user can sign up, then log in, and load the dashboard.
- [ ] An incorrect password is rejected and duplicate email shows a clear error.
- [ ] A new account has viewer permissions; privileged actions are denied.

## Start commands

Run from the project root, in separate terminals:

```bash
npm run server:dev
```

```bash
npm run dev
```

Open the local URL Vite prints. Set `VITE_API_URL=http://localhost:3000/api` in `.env` for local development if your environment needs it.
