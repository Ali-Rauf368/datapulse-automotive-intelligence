# DataPulse — User Guide

DataPulse — Automotive Intelligence Platform is a web dashboard for a car dealership. It keeps the vehicle inventory, records sales, manages workshop (service) jobs and shows live business figures, all stored in PostgreSQL.

---

## 1. Getting started

### Open the app
- **Local:** start the two parts (see section 9), then open http://127.0.0.1:5173
- **Online (Render):** open the URL shown in your Render dashboard. On the free plan the first visit after a break can take about a minute.

### Create an account
1. On the sign-in screen click **Create an account**.
2. Enter your **name**, **email** and a **password** (at least 6 characters). The eye icon shows or hides the password.
3. Click **Create account**. You are signed in straight away.

New accounts are always **Viewers** (read-only). An administrator can give you more access (section 8).

### Sign in and out
- Enter your email and password and click **Sign in**.
- **Sign out** is at the bottom of the left sidebar and in **Settings**.
- Sessions last 8 hours. When a session expires you return to the sign-in screen with a short explanation.

---

## 2. Roles: who can do what

| Action | Viewer | Operator | Admin |
| --- | :-: | :-: | :-: |
| See inventory, sales, service and analytics | ✓ | ✓ | ✓ |
| Add and edit vehicles | | ✓ | ✓ |
| Record sales | | ✓ | ✓ |
| Create and update service jobs | | ✓ | ✓ |
| Delete vehicles | | | ✓ |
| See the NiFi data-ingestion panel | | | ✓ |

Buttons you are not allowed to use are hidden, and the server refuses those actions as well.

---

## 3. The dashboard layout

- **Left sidebar:** navigation (Overview, Inventory, Sales & service, Analytics, System status, Users & roles, Settings), connection status, your name and role.
- **Refresh button** (top right, circular arrows): reloads all figures.
- **Key performance indicators:** four cards:
  - **Vehicles in inventory**: all vehicle records
  - **Active vehicles**: available for sale or service
  - **Sold vehicles**
  - **In service**: currently in the workshop

All numbers come live from the database and update after every change.

---

## 4. Vehicle inventory

### Search and filter
- Type in **Search VIN, make or model…** to find vehicles.
- Use the **All statuses** list to show only Active, Sold or In-service vehicles.
- Click a column heading (Vehicle, Model year, Status, Record ID) to sort; click again to reverse.
- The table shows 10 vehicles per page; use the arrows below it to move between pages.
- **Export CSV** downloads the vehicles currently shown, ready for Excel. The download icons on **Recent sales** and **Service jobs** export those lists.

### Add a vehicle (Operator, Admin)
1. Click **Add vehicle**.
2. Enter the **VIN** (exactly 17 characters; the letters I, O and Q are not allowed), **Make**, **Model** and **Model year**.
3. Click **Save vehicle**. New vehicles always start as **Active**.

### Edit a vehicle (Operator, Admin)
Click **Edit** on a row, change the details, then click **Save changes**. The status cannot be edited by hand; it changes through sales and service (sections 5 and 6).

### Delete a vehicle (Admin)
Click **Delete** and confirm. Vehicles that already have sales or service history cannot be deleted, so that history stays intact.

---

## 5. Sales

### Record a sale (Operator, Admin)
1. Go to **Sales & service → Record a sale**.
2. Choose the **Vehicle** and enter the **Sale price (€)**.
3. Click **Record sale**.

What happens next:
- The vehicle becomes **Sold**.
- **Recent sales**, total revenue, the **Sales activity** chart and the KPI cards update.
- The vehicle disappears from the sale list, so it can never be sold twice.

Rules:
- A vehicle that has an open service job cannot be sold until that job is completed or cancelled.
- The price must be greater than €0.

### Sales figures
- **Recent sales**: the newest sales with vehicle, VIN, date and price.
- **Sales activity**: daily revenue for the last seven days, with total revenue and average sale price.

---

## 6. Service (workshop) jobs

### Create a service job (Operator, Admin)
1. Go to **Sales & service → Create service job**.
2. Choose the **Vehicle** (sold vehicles are not offered).
3. Type a **Description** or click a suggestion (e.g. *Oil and filter change*).
4. Click **Create service job**. The vehicle becomes **In service**.

### Update a job
In the **Service jobs** list, use the status menu next to a job:

| Status | Meaning |
| --- | --- |
| **Open** | Job created, work not started |
| **In progress** | Work is being done |
| **Completed** | Work finished; the completion date is recorded |
| **Cancelled** | Job will not be done |

- Completed and cancelled jobs are final.
- When a vehicle's last open job is completed or cancelled, the vehicle returns to **Active**.
- **Service activity** shows how many jobs are in each status.

---

## 7. System status and data ingestion

- **System status** checks every 30 seconds that the **API** (with its response time) and the **PostgreSQL** database are working. Click **Check now** to test immediately.
- **Data ingestion (Apache NiFi)** (Admin only) lists vehicle records sent automatically by other systems with a machine key, and whether each was accepted or rejected. The NiFi software itself runs separately and is not part of this project.

### Messages you may see
| Message | Meaning and what to do |
| --- | --- |
| *Cannot reach the DataPulse API…* | The backend is not running. Start it (section 9) and refresh. |
| *Invalid email or password* | Check your details; passwords are case-sensitive. |
| *An account with this email already exists* | Sign in instead, or use another email. |
| *Your session has expired* | Sign in again. |
| *Your account has read-only access* | You are a Viewer; ask an admin for more access. |
| *This vehicle has already been sold* | Each vehicle can be sold only once. |
| *Inventory data check* | Some vehicles have a status that does not match their history; record the sale or open and close a service job to fix it. |

---

## 7a. Apache NiFi integration: its role in DataPulse

**Why it matters.** Apache NiFi is the automated data pipeline of DataPulse. Instead of typing every vehicle by hand, NiFi collects vehicle records from other systems, such as manufacturer feeds, dealer management systems or CSV exports, and delivers them to DataPulse continuously. The dashboard then shows the new stock immediately.

**How the data flows**

1. NiFi reads or receives vehicle data from a source system.
2. NiFi's **InvokeHTTP** processor sends each vehicle to `POST /api/vehicles` with a **machine key** (`Authorization: Bearer <key>`).
3. DataPulse validates the record (17-character VIN, make, model, year) and stores it in PostgreSQL.
4. Every request is logged as accepted or rejected, and admins see it in the **Data ingestion (Apache NiFi)** panel.

**Security of the machine key**

- Create it with `npm run setup:nifi-credential`. It is shown **once**; only a secure hash is stored.
- It has operator rights for **adding vehicles only**. It cannot edit or delete vehicles, record sales or service jobs, or read the logs.
- Keep it in NiFi's protected settings; never put it in Git or logs.

**What NiFi gets back**

| Response | Meaning |
| --- | --- |
| `201 Created` | Vehicle accepted and stored |
| `400 Bad Request` | Invalid data (e.g. a wrong VIN); send to NiFi's failure path |
| `409 Conflict` | Vehicle with this VIN already exists (duplicate) |
| `401` / `403` | Missing, wrong or insufficient key |

**Setting up InvokeHTTP**

- **HTTP Method:** `POST`
- **Remote URL:** `https://<your-datapulse-url>/api/vehicles`
- **Headers:** `Authorization: Bearer <machine key>`, `Content-Type: application/json`
- **Body (example):** `{"vin":"YV1XZK7V2R2000001","make":"Volvo","model":"XC40 Recharge","model_year":2024}`
- Route failure responses to a retry or review queue and use limited retries, so a vehicle is never created twice.

**Test without NiFi.** This command sends exactly what NiFi would send:

```bash
curl -X POST http://localhost:3000/api/vehicles \
  -H "Authorization: Bearer <machine key>" \
  -H "Content-Type: application/json" \
  -d '{"vin":"YV1XZK7V2R2000001","make":"Volvo","model":"XC40 Recharge","model_year":2024}'
```

**Status.** The DataPulse side of the integration (machine keys, ingestion endpoint, logging, admin panel) is built and tested. A NiFi flow and a running NiFi server are set up separately; backup and restore of a flow is described in `docs/nifi-backup-restore.md`.

---

## 8. Administrator tasks (terminal)

Run these in the project folder (`/home/repaircafe/Videos/datapulse1.`). For the online database, put `DATABASE_URL="<Render External Database URL>"` in front of the command.

| Task | Command |
| --- | --- |
| Create the first admin | `npm run setup:admin` |
| Change someone's role | `npm run setup:role -- person@example.com operator` (or `admin` / `viewer`) |
| Add demo data | `npm run seed:demo` |
| Remove demo data | `npm run seed:demo -- --remove` |
| Create a NiFi machine key | `npm run setup:nifi-credential` |
| Update the database structure | `npm run db:migrate` |

The last administrator cannot be downgraded, so you can never lock yourself out.

---

## 9. Running the project locally

Open two terminals in the project folder:

```bash
# Terminal 1 – backend (keep open)
cd "/home/repaircafe/Videos/datapulse1."
npm run server:dev

# Terminal 2 – frontend (keep open)
cd "/home/repaircafe/Videos/datapulse1."
npm run dev -- --host 127.0.0.1
```

Then open http://127.0.0.1:5173. Press **Ctrl+C** in each terminal to stop.

Quick health checks: http://localhost:3000/api/health and http://localhost:3000/api/health/db

Run the automated tests (they use a temporary database and never touch your data):

```bash
npm run test:isolated
```

---

## 10. Online version (Render)

The project is on GitHub at https://github.com/Ali-Rauf368/datapulse-automotive-intelligence. Render builds it automatically from the `render.yaml` Blueprint (New → Blueprint in the Render dashboard). Every new push to `main` redeploys the site. Free Render services sleep when idle, so open the site a minute before you need it.

---

## 11. Advanced features

### Business insights (all roles)
In **Insights**, choose **30 days**, **90 days**, **12 months** or **All time** to see total revenue, vehicles sold, the average number of days a vehicle was in stock before it sold, the average service turnaround in hours, revenue by month and the top five makes by revenue.

### Managing users (Admin)
In **Users & roles → Manage users**, change anyone's role with the role menu, or click **Deactivate** to block an account immediately (**Reactivate** restores it). You cannot change your own account, and DataPulse always keeps at least one active administrator.

### Activity log (Admin)
**Activity log** lists who did what and when: vehicles added, edited or deleted, sales, service job changes and user changes. Use the menu to show only one kind of activity.

### API documentation
Open `/api/docs` (for example http://localhost:3000/api/docs) for interactive documentation of every endpoint. Sign in through `POST /api/auth/login`, click **Authorize**, paste the token and try requests directly.

### Running with Docker
With Docker installed, `JWT_SECRET=$(openssl rand -hex 32) docker compose up --build` starts PostgreSQL and DataPulse together at http://localhost:3000. Create the first admin with `docker compose exec app npm run setup:admin`.
