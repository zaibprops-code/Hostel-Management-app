# System Architecture

## 1. Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Web / PWA (React + TS)                    │
│  Auth context · Hostel switcher · Role-filtered sidebar      │
│  Pages: Dashboard, Residents, Payments, Reports, Portal …    │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST /api (JWT Bearer)
┌───────────────────────────▼─────────────────────────────────┐
│                   API (Node + Express + TS)                  │
│  authenticate → requirePermission → hostel-scope → handler   │
│  Zod validation · audit logging · error handling             │
└───────────────────────────┬─────────────────────────────────┘
                            │ Prisma ORM
┌───────────────────────────▼─────────────────────────────────┐
│                        PostgreSQL                            │
│  Company → Hostel → Floor → Room → Bed → Resident …          │
└─────────────────────────────────────────────────────────────┘
```

**Request lifecycle for a protected route:**
`authenticate` (verify JWT, load user + hostel access) → `requirePermission('x.y')`
(role defaults + per-user overrides) → handler resolves the **accessible hostel IDs** and
scopes every query → mutations write an **audit log** entry.

The **notification layer is abstracted** (in-app `Notification` model) so email/SMS/WhatsApp/push
providers can be added later without touching business logic. No external provider is hardcoded.

---

## 2. Database Schema

Normalised relational model (`server/prisma/schema.prisma`). ~35 entities.

### Core hierarchy
```
Company ─┬─ User ─── UserHostelAccess ┐
         │                            │
         └─ Hostel ───────────────────┘
              ├─ Floor ── Room ── Bed ── Resident ── ResidentDocument
              │                              ├─ Admission
              │                              ├─ RentCharge ─ PaymentAllocation ─ Payment
              │                              ├─ SecurityDeposit ─ DepositTransaction
              │                              └─ Checkout
              ├─ Expense / Income
              ├─ Investment / Loan            (company or hostel level)
              ├─ Staff ─ StaffAttendance / SalaryPayment
              ├─ Menu / FoodPlan / FoodAttendance
              ├─ InventoryItem ─ InventoryTransaction
              ├─ Supplier ─ Purchase ─ PurchaseItem
              ├─ MaintenanceTicket / Complaint / Visitor / Notice
              └─ (all mutations) ─ AuditLog / Notification
```

### Notable design decisions
- **Money** stored as `Decimal(12,2)`; serialized to numbers at the API edge.
- **RentCharge** is unique per `(resident, year, month)` → idempotent rent generation.
- **PaymentAllocation** splits one payment across multiple rent charges (oldest-first).
- **SecurityDeposit + DepositTransaction** keep deposits on their own ledger (DEPOSIT / DEDUCTION / REFUND),
  so they never leak into operating revenue.
- **Expense/Income/Payment** carry a status (`ACTIVE`/`VOIDED` or `COMPLETED`/`VOIDED`) — financial
  records are reversed, not deleted.
- **User.permissions** is a JSON override map layered on top of role defaults.
- Bed status enum (`AVAILABLE / RESERVED / OCCUPIED / MAINTENANCE / BLOCKED`) drives the occupancy map.

---

## 3. Permission Model

`server/src/lib/permissions.ts` defines ~40 `module.action` permissions and the default set per role.

```ts
hasPermission(role, userOverrides, 'finance.viewProfit')
// → userOverrides wins if the key is present, otherwise the role default applies
```

- **Hostel scoping** (`middleware/rbac.ts`): Owner → all company hostels; others → assigned hostels only.
- The frontend receives the user's **effective permission list** and uses it to build the sidebar
  and hide unauthorised modules, while the server independently enforces every check.

---

## 4. API Reference

All routes are prefixed `/api`. Protected routes require `Authorization: Bearer <accessToken>`.

### Auth  (`/auth`)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/login` | Email + password → access & refresh tokens |
| POST | `/refresh` | Rotate tokens from a refresh token |
| GET  | `/me` | Current session user + permissions |
| POST | `/change-password` | Change own password |
| POST | `/forgot-password` | Issue reset token |
| POST | `/reset-password` | Reset via token |
| POST | `/logout` | Audit logout |

### Core operations
| Resource | Routes |
|----------|--------|
| Dashboard | `GET /dashboard` (role-aware KPIs + charts) |
| Hostels | `GET/POST /hostels`, `GET/PUT /hostels/:id` |
| Structure | `POST /structure/{floors,rooms,beds}`, `PATCH /structure/beds/:id/status`, `GET /structure/map`, `GET /structure/available-beds` |
| Residents | `GET/POST /residents`, `GET/PUT /residents/:id`, `PATCH /residents/:id/status` |
| Admissions | `GET/POST /admissions` (atomic check-in) |
| Checkouts | `GET /checkouts/:id/settlement`, `POST /checkouts/:id`, `POST /checkouts/:id/notice` |
| Payments | `GET/POST /payments`, `GET /payments/:id/receipt`, `POST /payments/:id/void`, `GET /payments/reports/outstanding` |
| Finance | `GET/POST /expenses`, `POST /expenses/:id/void`, `GET/POST /income`, `GET /deposits` |
| Capital | `GET/POST /capital/investments`, `GET/POST /capital/loans` |
| Reports | `GET /reports/{occupancy,rent-collection,income,expenses,profit-loss,residents,deposits,hostel-comparison}` |
| Food | `GET/POST /food/plans`, `GET/PUT /food/menu`, `GET /food/headcount` |
| Inventory | `GET/POST /inventory`, `POST /inventory/:id/transaction`, `GET/POST /suppliers` |
| Staff | `GET/POST /staff`, `POST /staff/:id/salary`, `GET /staff/salary/report` |
| Ops | `/maintenance`, `/complaints`, `/visitors`, `/notices` (list/create/update) |
| Users | `GET/POST /users`, `PUT /users/:id`, `POST /users/:id/reset-password`, `GET /users/permissions` |
| Audit | `GET /audit` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` |
| Uploads | `POST /uploads/resident/:id/document` (type-checked, size-limited) |
| Portal | `GET /portal/me`, `GET /portal/notices`, `GET /portal/requests`, `POST /portal/{complaints,maintenance}` |

---

## 5. Page / Route Structure (web)

```
/login  /forgot-password  /reset-password        (public)
/                       Dashboard (role-aware)
/hostels  /rooms  /residents  /residents/:id  /admissions
/payments  /expenses  /income  /profit-loss  /capital
/food  /inventory  /suppliers  /staff
/maintenance  /complaints  /visitors  /notices
/reports  /users  /audit  /settings
/portal                 Resident self-service (own chrome)
```
The sidebar renders only the routes the signed-in user is permitted to see.

---

## 6. Development Roadmap

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | Foundation: project setup, DB, auth, RBAC, company & hostels | ✅ Implemented |
| 2 | Operations: floors, rooms, beds, residents, admissions, checkout | ✅ Implemented |
| 3 | Finance: rent, payments, deposits, income, expenses, P&L, capital | ✅ Implemented |
| 4 | Food & inventory: plans, menus, inventory, suppliers | ✅ Implemented |
| 5 | Staff & ops: staff, salaries, maintenance, complaints, visitors | ✅ Implemented |
| 6 | Reports & analytics: dashboards, charts, CSV export | ✅ Implemented |
| 7 | Security & quality: audit logs, validation, error/loading/empty states | ✅ Implemented |
| — | Future: recurring-expense automation, notification providers (email/SMS/WhatsApp/push), QR food attendance, native mobile shell, staff attendance UI, supplier purchase UI | 🔜 Modular hooks in place |

The architecture intentionally leaves clean extension points (notification abstraction,
recurring-expense fields, food attendance model, purchase model) so future phases slot in
without rework.
