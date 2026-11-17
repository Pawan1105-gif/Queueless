# QueueLess

QueueLess is a multi-organization appointment booking and queue management application. The JavaScript frontend is built with React and Vite; the API uses Python 3.10, FastAPI, SQLAlchemy, Alembic, and PostgreSQL.

## Features

- Customer registration, login, editable profile details, private profile-photo upload, and password management with Argon2 password hashing and JWT access tokens.
- The customer profile shows past appointments and read-only prescription medication and image records for each visit.
- Customer Body study offers an animated, rotatable 3D atlas of human muscles and skeleton with selectable structures and educational information.
- Organization applications and platform-admin approval, organization profiles, services, operating hours, holidays, counters, and staff assignments.
- Separate customer, organization-administrator, and Super Admin sign-in options. Organization administrators land in the existing workspace; Super Admins land in the platform control room.
- Organization-scoped authorization for admins and counter staff.
- Organization-created doctor accounts with a clinical workspace to upload/remove prescription images and update prescribed medications for their appointments. Patients can view but cannot modify these records.
- Organization doctor roster with required professional details, organization-scoped registration numbers, and admin-maintained Available/Occupied status tabs.
- Organization appointment details show the customer-provided description. Doctors can open an appointment, search/select medication names from the organization-managed catalog, confirm dosage and instructions, or upload multiple prescription images as ordered slides.
- Customer medication search starts from ten sample medication names, requests browser location only after permission, and shows organization-reported available stock alongside mapped OpenStreetMap pharmacies. Stock results include organization contact details, distance, and a rough travel-time estimate.
- Service availability, appointment booking and cancellation, unique appointment references and date-aware queue tokens.
- Signed, expiring QR check-in tokens validated by the API; duplicate check-ins are rejected.
- Queue lifecycle actions, counter status controls, customer notifications, estimated waits, and organization-authorized WebSocket updates.
- Appointment feedback and organization/platform analytics backed by PostgreSQL data.
- Responsive customer, organization, staff, and super-admin workspaces.

Organization administrators configure weekly opening and closing times under **Organization → Settings → Operating hours**. The **Services → Add service** form previews the appointment start times generated from that schedule; slots advance by the service duration (for example, every 30 minutes for a 30-minute service). Holidays, existing bookings, and per-slot capacity are applied to date-specific customer availability.

Notifications are currently in-app and persisted in PostgreSQL. No email or SMS is sent. Organization logos are represented by a URL field. Prescription images are validated JPEG, PNG, or WebP files (up to 5 MB each, at most 10 per appointment) stored in PostgreSQL and served only after appointment authorization.

Organization admins manage the clinic medication catalog in **Organization → Settings → Medication catalog**. Only active catalog entries are selectable by that organization’s doctors; dosage, frequency, duration, and instructions are entered by the doctor per appointment. QueueLess does not recommend medications or provide medical advice.

Organization admins can use **Medication centre** to add and update per-organization stock from the shared sample medication list. To appear in nearby customer searches, set the organization address, contact number, and store coordinates under **Settings → Organization details**. The browser location button should be used while at the store; coordinates can also be entered manually. Customers see only active organizations reporting positive quantities and having saved coordinates. Organizations remain isolated from one another's inventory.

Customers can open **Find medication** to search the seeded sample directory and locate reported stock within 10 km. The browser requests location only after the customer selects **Use my location**. The distance is straight-line; travel time is a rough estimate using a fixed distance-to-road and average-speed rule, not live routing or traffic. Customers should call the organization to confirm stock and opening hours. Mapped pharmacies from OpenStreetMap are shown separately when their inventory has not been reported. The browser sends coordinates and medication ID to QueueLess for stock search; coordinates are also sent to the public OpenStreetMap Overpass service, but the medication name is not sent to OpenStreetMap.

The customer workspace also has a clearly marked ambulance-directory demo. Its driver listings, availability, positions, distances, and ETAs are fictional; it does not dispatch a vehicle. The demo displays the user-provided shared contact number in a click-to-call dialog, but QueueLess does not verify the number, place calls itself, or create dispatch requests. The interactive OpenStreetMap uses public map tiles; granting browser location centers the map and calculates demo distances locally. Map tile requests can disclose the visible map area to OpenStreetMap. This demo is not an emergency dispatch service.

Customers can open **Body study** to rotate an interactive 3D model of human muscles and skeleton, select actual named structures, switch between muscle and skeleton layers, and view educational descriptions. Its Écorché anatomical asset is provided under CC BY-SA 4.0; attribution and the license are included under `frontend/public/models/`. This educational visualization is not a medical reference or diagnostic tool. The Three.js renderer and study page are loaded on demand when visiting the feature.

## Requirements

- Python 3.10
- PostgreSQL 18.7 (or a compatible PostgreSQL server)
- Node.js and npm

## Configuration

Keep the existing `backend/.env` private and unchanged. The backend loads `.env` and then `.env.local`; environment variables override both. A new local setup can copy `backend/.env.example` to `backend/.env` and set a PostgreSQL Psycopg 3 URL, for example `postgresql+psycopg://user:password@localhost:5432/queueless_db`.

Configure at least:

```dotenv
DATABASE_URL=postgresql+psycopg://<user>:<password>@localhost:5432/<database>
FRONTEND_URL=http://localhost:5173
JWT_SECRET_KEY=<random-secret-at-least-32-characters>
ACCESS_TOKEN_EXPIRE_MINUTES=30
QR_TOKEN_EXPIRE_MINUTES=1440
```

Generate a signing key locally with Python and store it in the ignored `backend/.env.local` file. Do not share or commit the output:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Do not commit `.env`, `.env.local`, or credentials.

## Install

From the project root:

```powershell
python -m pip install -r backend/requirements.txt
Set-Location frontend
npm install
```

## Database migrations

Run Alembic from the backend directory. Migrations create and evolve the QueueLess schema; they do not reset existing database contents.

```powershell
Set-Location backend
python -m alembic upgrade head
```

After model changes, create a migration and review it before applying:

```powershell
python -m alembic revision --autogenerate -m "describe the schema change"
python -m alembic upgrade head
```

## Start the application

Run these commands in separate terminals:

```powershell
Set-Location backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

```powershell
Set-Location frontend
npm run dev
```

The frontend is available at `http://localhost:5173`; the API is at `http://127.0.0.1:8001`. FastAPI's interactive documentation is at `http://127.0.0.1:8001/docs`, and the database connection check is at `http://127.0.0.1:8001/health/db`. The frontend defaults to this local API URL; set `VITE_API_BASE_URL` when using a different API host or port.

## First-time super-admin setup

Create a platform administrator from the backend directory. The script prompts for an email and password without echoing the password, then inserts only that user account:

```powershell
Set-Location backend
python -m app.create_super_admin
```

There is no default super-admin password or seeded production account.

## Add sample organizations

To populate the local app with three clearly labeled, bookable sample organizations, run this from the backend directory:

```powershell
python -m app.seed_demo_data
```

The command is safe to rerun: organizations with the sample slugs already present are left unchanged. It creates sample services, an active counter, and daily 09:00–17:00 UTC operating hours. These are demo records, not real businesses.

## Tests and checks

```powershell
Set-Location backend
python -m pytest -q
python -m alembic check
```

```powershell
Set-Location frontend
npm run build
npm audit
```

The PostgreSQL-backed customer-to-staff workflow test covers registration, organization approval, service visibility, booking and duplicate-booking prevention, QR generation/check-in and duplicate-check-in prevention, token lifecycle, feedback, analytics, notifications, and tenant isolation. Prescription tests verify doctor account creation, image upload/removal, medication updates, patient read-only access, image authorization, and organization isolation. Medication-directory tests verify OpenStreetMap pharmacy normalization and distance ordering.

## Development progress

- [x] Milestone 1: inspect the project, preserve the existing PostgreSQL configuration, and verify database connectivity.
- [x] Milestone 1: establish the SQLAlchemy schema and Alembic migration workflow.
- [x] Milestone 1: create the React/Vite JavaScript application and responsive public landing page.
- [x] Milestone 2: authentication, role-aware workspaces, profile updates, and protected routes.
- [x] Milestone 3: organization applications, approvals, service/counter/staff management, hours, and holidays.
- [x] Milestone 4: organization discovery, availability, appointment booking, cancellation, and history.
- [x] Milestone 5: queue token generation and staff queue lifecycle controls.
- [x] Milestone 6: signed QR generation and backend-validated staff check-in.
- [x] Milestone 7: authorized WebSocket queue updates and reconnection handling.
- [x] Milestone 8: persistent in-app notifications and transparent estimated waits.
- [x] Milestone 9: organization/platform analytics and customer feedback.
- [x] Milestone 10: customer-to-staff workflow tests, migration/schema check, frontend production build, and dependency audit.
- [x] Prescription records: organization-created doctor accounts, patient read-only prescription images and medication details, organization-scoped writes, and PostgreSQL migration/tests.
- [x] Doctor roster: detailed doctor onboarding, persistent availability tracking, and organization-scoped directory.
- [x] Customer body study: lazy-loaded, realistic 3D muscle and skeleton atlas with selectable named structures and layer controls.
- [x] Separate organization-administrator sign-in option with organization workspace routing and account-role validation.
- [x] Dedicated Super Admin login option with role validation and platform dashboard routing.
