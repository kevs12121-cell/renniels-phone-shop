# Renniels Phone Shop

An internal point-of-sale and inventory system for a phone retail shop: IMEI-tracked phones and tablets, accessories, purchasing, returns, reports, and two roles (**Owner** and **Cashier**). It is a staff tool. It has no customer storefront.

- **Client:** React 18 + Vite (`client/`), responsive from 320px phones to wide desktops
- **API:** Express + MySQL 8 (`server/`), JWT auth, role-based access, audit logging
- **Database:** `database/schema.sql`, created and upgraded automatically when the API starts

## Features

| Area | Owner | Cashier |
|---|---|---|
| Dashboard | Shop sales, profit, inventory value, stock alerts, 14-day trend, payment mix, top sellers | Own shift sales, transactions, items sold, personal trend and best sellers, stock alerts |
| Point of Sale | ✓ unlimited discounts | ✓ discounts up to 10% |
| IMEI / serial unit selection, cash change, GCash/card/bank references, printable receipts | ✓ | ✓ |
| Sales history, receipts, CSV export | ✓ cancel sales, export | ✓ view and reprint |
| Returns & refunds (restock good items, set aside defective units) | ✓ | ✓ |
| Products | Create, edit, margins, IMEI units | Read-only price and stock checker |
| Inventory | Valuation, adjustments, damage write-offs | Stock levels |
| Categories, stock movements, purchases (receiving with IMEIs), suppliers | ✓ | n/a |
| Customers with purchase history | ✓ | ✓ |
| Reports: net sales, gross profit, refunds, daily chart, categories, payments, staff, top products, inventory valuation | ✓ | n/a |
| Users (add cashiers, deactivate, reset passwords), audit logs, business settings | ✓ | n/a |
| My Account: change name and password | ✓ | ✓ |

## Demo data

When the product catalog is empty, the API fills it with about 90 days of internally consistent demo data:
- 48 products and 250+ IMEI units
- purchase orders, roughly 430 sales across 4 cashiers, cancellations and returns
- stock adjustments, inventory logs and audit logs

Stock counts always reconcile with the movement logs. Set `SEED_DEMO_DATA=false` to start with an empty shop instead.

Demo accounts created on first run:

| Role | Email | Password |
|---|---|---|
| Owner | `OWNER_EMAIL` (default `owner@renniels.local`) | `OWNER_PASSWORD` |
| Cashier | `cashier@renniels.local` (also `john@` and `angela@renniels.local`) | `CASHIER_PASSWORD` |

Change these passwords under **My Account** after the first sign-in.

## Local development

1. Install MySQL 8 and Node.js 20+.
2. Copy `.env.example` to `.env` and set `DB_PASSWORD`, `JWT_SECRET`, `OWNER_PASSWORD` and `CASHIER_PASSWORD`.
3. Install dependencies with `npm run install:all`.
4. Start both apps with `npm run dev`.
   - API: http://localhost:5007 (creates or upgrades the database and seeds demo data on start)
   - Web: http://localhost:5181 (also reachable from phones on the same Wi-Fi at `http://<laptop-ip>:5181`)

`npm run seed --prefix server` resets the owner password to the current `OWNER_PASSWORD`.

## Deploying to Railway

The repo includes a `Dockerfile`, which Railway detects automatically. One service runs the API and serves the built client.

1. Create a Railway project, then add a **MySQL** database and a service from this GitHub repo.
2. Set these variables on the app service:
   ```
   DATABASE_URL=${{MySQL.MYSQL_URL}}
   JWT_SECRET=<long random string>
   OWNER_PASSWORD=<owner password>
   CASHIER_PASSWORD=<cashier password>
   APP_TIMEZONE=+08:00
   ```
3. Generate a public domain for the service. Health check: `GET /api/health`.

## API overview

All routes are under `/api` and need `Authorization: Bearer <token>`, except `POST /auth/login` and `GET /health`. 🔒 marks Owner-only routes.

- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/profile`, `PUT /auth/password`
- `GET /dashboard`: shop-wide for the Owner, personal for a Cashier
- Products: `GET /products`, `GET /products/:id`, `GET /products/:id/units`, `POST|PUT /products` 🔒
- Categories: `GET /categories`, `POST|PUT /categories` 🔒
- Suppliers: `GET /suppliers`, `GET /suppliers/:id` 🔒, `POST|PUT /suppliers` 🔒
- Customers: `GET|POST /customers`, `GET|PUT /customers/:id`
- Inventory: `GET /inventory`, `GET /inventory/logs`, `POST /inventory/adjust` 🔒
- Purchases: `GET /purchases` 🔒, `GET /purchases/:id` 🔒, `POST /purchases` 🔒, `PUT /purchases/:id/payment` 🔒
- Sales: `GET /sales`, `GET /sales/:id`, `POST /sales` (checkout), `POST /sales/:id/cancel` 🔒
- Returns: `GET /returns`, `GET /returns/:id`, `POST /returns`
- Reports: `GET /reports?from=YYYY-MM-DD&to=YYYY-MM-DD` 🔒
- Users: `GET|POST /users` 🔒, `PUT /users/:id` 🔒, `PUT /users/:id/password` 🔒
- Audit logs: `GET /audit-logs` 🔒
- Settings: `GET /settings` (all roles, for receipts), `PUT /settings` 🔒

Never commit `.env` or real credentials.
