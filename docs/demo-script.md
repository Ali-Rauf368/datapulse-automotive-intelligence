# DataPulse demo script (about 5 minutes)

## Before the interview

1. Start the API: `npm run server:dev`. Check that it prints
   `Database connected; schema is up to date`.
2. Start the frontend: `npm run dev -- --host 127.0.0.1` and open the URL Vite prints.
3. Confirm the admin sign-in works, then sign out. Accounts created with
   "Create an account" are viewers; to grant more, run
   `npm run setup:role -- <email> operator` (or `admin`).
4. The dashboard has demo history from `npm run seed:demo` (18 vehicles, 9 sales,
   7 service jobs). Remove it later with `npm run seed:demo -- --remove`.
5. Optional: run `npm run test:isolated` once so you can mention the result
   (it uses a disposable database and never touches `datapulse`).

## Walkthrough

1. **Sign up.** Create an account from the login screen. It always gets the
   **viewer** role, even if a request asks for more: the server decides the role.
   Point out the read-only dashboard: no edit, delete or sales controls.
2. **Sign out, sign in as admin.** Show the KPIs, all computed from PostgreSQL.
   If the "Inventory data check" note is shown, explain that it flags records whose
   status disagrees with their sales or service history.
3. **Inventory.** Search by make, filter by status, add a vehicle (VIN validation
   rejects letters I, O and Q), then edit it.
4. **Record a sale.** Pick the new vehicle and enter a price. The vehicle becomes
   Sold, the KPIs, revenue, sales history and chart update, and the vehicle can no
   longer be sold twice.
5. **Service job.** Open a job for another vehicle (it goes In service), move it to
   In progress, then Completed. The vehicle returns to Active, and the job is final.
6. **Integrity.** Try to delete the sold vehicle: the API refuses because it has
   sales history.
7. **System status and NiFi.** Show the live API and database checks, then the
   admin-only Data ingestion panel: records sent with a hashed machine credential,
   as a NiFi InvokeHTTP processor would. Be clear that the flow itself runs in NiFi
   and is not part of this repository.

## Talking points

- Authorization is enforced by the API on every route; the UI only hides controls.
- Sales and service writes run in transactions with row locks, so concurrent
  requests cannot double-sell a vehicle.
- Tests run on a disposable PostgreSQL and refuse to touch a non-test database.
- Errors are JSON with no stack traces; the dashboard degrades panel by panel
  when something fails.
