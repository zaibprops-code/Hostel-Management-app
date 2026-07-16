# 🏨 Hostel Management System

A complete, production-ready **multi-hostel management platform** built as a scalable
SaaS-style application. It manages the full hostel operation — residents, rooms & beds,
admissions, rent & deposits, expenses, income, food & kitchen, inventory, staff,
maintenance, complaints, visitors, notices, reports and full financials — across one or
many hostel branches under a single company.

Built for a hostel business operating in **Islamabad / Rawalpindi, Pakistan**, and
designed to scale from **one hostel → many hostels → a full hostel chain**.

---

## ✨ Highlights

- **Multi-hostel / multi-branch** with per-hostel data isolation and an owner-level global view.
- **Role-based access control** (Owner, Manager, Accountant, Kitchen, Staff, Resident) with
  fine-grained per-user permission overrides.
- **Real business logic** — not a CRUD skeleton: atomic admissions that prevent double-booking,
  automatic rent generation, payment auto-allocation, deposit ledgers, checkout settlement,
  and P&L that correctly **excludes deposits, owner investment and loans** from profit.
- **Financial integrity** — payments and expenses are **voided, never deleted**; every important
  action is written to an **immutable audit log**.
- **Responsive PWA** that works on desktop, laptop, tablet and mobile.
- **Resident self-service portal** (rent status, payments, food plan, notices, complaints & maintenance requests).
- **Realistic seed data**: 3 hostels, ~44 residents, rent history, expenses, staff, inventory, menus.

---

## 🧱 Tech Stack

| Layer      | Technology |
|------------|-----------|
| Frontend   | React 18 · TypeScript · Vite · Tailwind CSS · Recharts · React Router |
| Backend    | Node.js · TypeScript · Express · Zod validation |
| Database   | PostgreSQL · Prisma ORM |
| Auth       | JWT (access + refresh) · bcrypt password hashing · RBAC |
| Security   | Helmet · CORS · rate limiting · input validation · secure file uploads |

Monorepo managed with npm workspaces: [`server/`](server) (API) and [`web/`](web) (SPA/PWA).

---

## 📱 Android app (APK)

The app also ships as a **native Android APK** (via Capacitor). A GitHub Action builds it
automatically — no build machine needed — and one APK works for any deployment (it asks for
your server address on first launch). See **[MOBILE.md](MOBILE.md)**.

## 🌐 Deploy online (get a shareable link)

One click deploys the database, backend and website together (no values to paste):

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/zaibprops-code/Hostel-Management-app)

Then follow the short, plain-English steps in **[DEPLOYMENT.md](DEPLOYMENT.md)**.

## 🚀 Getting Started (run locally)

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ running locally (or use `docker compose up -d db`)

### 1. Install
```bash
npm install
```

### 2. Configure the database
Copy the example env and adjust the connection string if needed:
```bash
cp server/.env.example server/.env
```
Default: `postgresql://postgres:postgres@localhost:5432/hostel_db`

### 3. Create schema + seed demo data
```bash
npm run db:migrate   # or: npm --workspace server run db:push
npm run db:seed
```

### 4. Run everything
```bash
npm run dev
```
- API → http://localhost:4000
- Web → http://localhost:5173

### Demo accounts (password: `Password123`)
| Role       | Email |
|------------|-------|
| Owner      | `owner@xyzhostel.com` |
| Manager    | `manager@xyzhostel.com` |
| Accountant | `accountant@xyzhostel.com` |
| Kitchen    | `kitchen@xyzhostel.com` |
| Resident   | `resident@xyzhostel.com` |

> Log in as the **Owner** for the full view, then as the **Manager** to see the sidebar and
> data automatically restrict to a single hostel with profit figures hidden.

---

## 🔐 Roles & Permission Matrix (summary)

Permissions use `module.action` keys. Role defaults live in
[`server/src/lib/permissions.ts`](server/src/lib/permissions.ts); the Owner can grant extra
permissions to any user (e.g. let a Manager view profit or refund deposits).

| Capability                | Owner | Manager | Accountant | Kitchen | Staff | Resident |
|---------------------------|:---:|:---:|:---:|:---:|:---:|:---:|
| Dashboard                 | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Hostels / Rooms / Beds    | ✅ | ✅ | 👁 | — | — | — |
| Residents & Admissions    | ✅ | ✅ | 👁 | — | — | own |
| Payments & Deposits       | ✅ | ✅ | ✅ | — | — | 👁 |
| Expenses & Income         | ✅ | ✅ | ✅ | 👁 | — | — |
| **Profit & Loss**         | ✅ | grantable | ✅ | — | — | — |
| **Capital & Loans**       | ✅ | grantable | — | — | — | — |
| Food & Inventory          | ✅ | ✅ | — | ✅ | — | 👁 |
| Staff / Maintenance / etc | ✅ | ✅ | — | — | partial | — |
| Users & Permissions       | ✅ | grantable | — | — | — | — |
| Audit Logs                | ✅ | grantable | — | — | — | — |

✅ manage · 👁 view · grantable = off by default, owner can enable per-user.

Non-owner users are additionally **scoped to the hostels assigned to them**; the Owner sees
every hostel in the company.

---

## 🗺️ Architecture, Schema & API

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for:
- System architecture & data flow
- Full database schema (35+ entities) and key relationships
- Complete API route reference
- Page/route structure
- Development roadmap & phases

---

## 📏 Key Business Rules Enforced

1. A bed can never be assigned to two active residents (checked atomically in a transaction).
2. Checkout requires a final settlement; the bed is auto-freed on finalization.
3. Security deposits are tracked on a separate ledger and **excluded from revenue/profit**.
4. Owner investment and loans are tracked separately and **never counted as revenue**.
5. Financial records are **voided/reversed, not deleted**.
6. Room & bed availability updates automatically on admission and checkout.
7. Rent charges generate automatically per resident per month.
8. Every sensitive action is recorded in the audit log with user, entity and before/after values.
9. Passwords are bcrypt-hashed; documents and financial data are permission-gated.

---

## 📦 Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run API + web together |
| `npm run build` | Production build of both |
| `npm run db:seed` | Seed demo data |
| `npm run db:reset` | Drop, re-migrate and re-seed |

---

## 📱 PWA / Mobile

The web app is responsive and ships a web manifest, so it can be installed to a phone/tablet
home screen. The clean REST API + typed client also make it straightforward to wrap in a
native Android/iOS shell later.
