# MediBox — Multi-Tenant Pharmacy ERP

A pharmacy billing, inventory, and reporting platform for medicine shops. Built as a multi-tenant system: a **Super Admin** enrolls pharmacy **Shops**, each shop manages its own **Stores** (branches), staff, customers, product catalog, and billing.

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript, Prisma ORM
- **Database:** PostgreSQL (currently hosted on Neon)

## Project Structure

```
backend/
  api/
    index.ts               # Vercel serverless entry point — re-exports src/app.ts
  vercel.json               # rewrites all paths to api/index.ts; runs migrate deploy on build
  prisma/
    schema.prisma        # full data model (Shop, Store, Product, Batch, Sale, ...)
    seed.ts               # creates accounts + shop + stores (no product data)
    migrations/
  scripts/
    importMedicineData.ts # bulk-imports a real product/stock spreadsheet
    inspectXlsx.ts         # utility to inspect an xlsx file's columns before importing
  src/
    app.ts                  # Express app (routes/middleware only, no listener) — used by
                             # both the local dev server and the Vercel function
    index.ts                # local dev entrypoint: imports app.ts and calls app.listen()
    routes/
      authRoutes.ts        # super admin + shop admin login
      superadminRoutes.ts  # shop enrollment, platform stats, per-shop sales
      shopRoutes.ts         # everything scoped to one shop: stores, customers,
                             # product search, billing/sales, dashboard, reports, CSV import
    auth.ts                # JWT signing + requireSuperAdmin / requireShopAdmin middleware
    db.ts                  # Prisma client singleton (cached globally for serverless reuse)
    uploads.ts              # multer config, in-memory storage (shop logos, CSV imports)
  data/                     # gitignored — drop source spreadsheets here for import scripts
frontend/
  src/
    app/
      superadmin/           # super admin login + dashboard (enroll shops, view sales)
      [shopSlug]/login/     # shop admin login (per-shop URL)
      [shopSlug]/(app)/     # auth-guarded shop app: billing, customer-registration,
                             # dashboard, sales-report, and a catch-all "coming soon"
                             # page for modules not yet built (GRN, stock adjustment, etc.)
    components/admin/       # AsterHeader, AsterBillingView, AsterCustomerRegistrationView,
                             # AsterPharmacyDashboardView, AsterSalesReportView
    context/ShopSessionContext.tsx  # shop auth/session + selected-store state
    services/api.ts          # typed fetch wrapper for the Express API
```

## What's Built

- **Super Admin**: enroll shops (name, logo, URL slug, admin username/password), suspend/activate a shop, view any shop's sales, platform-wide stats (shop count, total medicines, total batches)
- **Shop Admin**: logs in at `/<shop-slug>/login`
- **Customer Registration**: full field set (store, type, mobile, address, gender, birth/marriage date, email, NID/passport, employee org/designation, auto-generated sequential customer ID), search/filter
- **Billing**: typeahead product search (tuned for tens of thousands of items via a Postgres trigram index), barcode lookup, duplicate-batch blocking, Free-item handling, doctor name/address enforcement for antibiotic/sedative-CNS items, real transactional checkout (stock is decremented, invoice number allocated atomically, reward points accrued)
- **Pharmacy Dashboard**: per-store sales/collection totals with date-range filtering
- **Pharmacy Sales Report**: Department Wise / Sub-Department Wise (Summary & Details) / Outlet Wise reports with store, department, supplier, shift, and user filters

**Not yet built** (menu items exist and show a "coming soon" placeholder): GRN (With/Without PO), Purchase Requisition, Stock Adjustment, Expiry Product Return, Invoice Item Cancel, Sold Product Ledger, Stock Data, Virtual Stock Transfer.

## Setup

This project uses **pnpm** (root, `backend/`, and `frontend/` pin `packageManager` in `package.json`). The repo root is a pnpm workspace covering `backend/` and `frontend/`, and `pnpm-workspace.yaml` whitelists the native/postinstall scripts the project needs (`@prisma/client`, `prisma`, `@prisma/engines`, `sharp`, `unrs-resolver`) via `onlyBuiltDependencies` — without that, pnpm blocks lifecycle scripts by default and `prisma generate` / `next build` will fail.

1. **Install dependencies** (from the repo root — this installs both projects)
   ```bash
   pnpm install
   ```
   Or per-project: `cd backend && pnpm install` / `cd frontend && pnpm install`.

2. **Configure the database** — copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` to a real Postgres connection string.

3. **Run migrations**
   ```bash
   cd backend
   npx prisma migrate dev
   ```

4. **Seed accounts, shop, and stores** (no product data — see step 5 for that)
   ```bash
   pnpm run seed
   ```
   Creates:
   - Super Admin: `superadmin@gmail.com` / `superadmin123`
   - Shop `shop` ("Aster Pharmacy Bangladesh") with two admin logins at `/shop/login`: `admin` / `admin123` and `shariar` / `Admin@123`
   - 3 stores: KALSHI PHARMACY (MIRPUR), DHANMONDI BRANCH #1, GULSHAN MAIN PHARMA

5. **Import real product/stock data** — drop a spreadsheet at `backend/data/Medicine Data.xlsx` (this path is gitignored) and run:
   ```bash
   pnpm run import:medicines
   ```
   This upserts departments/sub-departments/suppliers, bulk-inserts products (deduped by item code), and creates one opening-stock batch per product in the KALSHI01 store. **The source data has no batch numbers or expiry dates**, so every imported batch gets a synthetic batch number and a placeholder expiry 2 years out — replace with real batch/expiry data once the GRN module exists. If your spreadsheet has different column names, check `backend/scripts/inspectXlsx.ts` (run it first to see the actual columns) and adjust the field mapping in `importMedicineData.ts` accordingly.

6. **Run the servers**
   ```bash
   # terminal 1
   cd backend && pnpm run dev      # http://localhost:5000

   # terminal 2
   cd frontend && pnpm run dev     # http://localhost:3000
   ```

7. **Log in**
   - Super Admin: `http://localhost:3000/superadmin/login`
   - Shop staff: `http://localhost:3000/shop/login`

## Deployment (Vercel)

The repo deploys as **two separate Vercel projects**, one per folder (set each project's "Root Directory" to `backend` or `frontend` respectively):

- **Backend** (`backend/`): the Express app doesn't run as a long-lived server on Vercel — `backend/api/index.ts` exports it as a single serverless function, and `backend/vercel.json` rewrites every incoming path to that function so Express's own router still sees the full original URL (e.g. `/api/shops/shop/products/search`). `vercel.json` also runs `prisma migrate deploy && prisma generate` as the build command, so schema changes ship automatically on every deploy.

  Required environment variables (set in the backend Vercel project's Settings → Environment Variables):
  - `DATABASE_URL` — same Neon connection string as local dev
  - `JWT_SECRET` — a long random string (**use a different value than local dev** for a real production deployment)
  - `CORS_ORIGIN` — the frontend's deployed URL, e.g. `https://medi-box-two.vercel.app`
  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — required for shop logo uploads; without them logos fall back to base64 data URIs

- **Frontend** (`frontend/`): a normal Next.js deploy. `frontend/.env.production` bakes in `NEXT_PUBLIC_API_BASE_URL=https://medi-box-8jqj.vercel.app/api` as the default (this is committed — `NEXT_PUBLIC_*` vars are exposed to the browser anyway, so it isn't a secret). If the backend's URL ever changes, either edit that file or override it with a `NEXT_PUBLIC_API_BASE_URL` env var in the frontend Vercel project's settings (dashboard-set env vars take precedence over `.env.production`).

Shop logos are uploaded to **Cloudinary** (folder `medibox/shop-logos`) and stored by URL. If Cloudinary isn't configured, logos fall back to base64 data URIs in the database — both avoid writing to disk since Vercel's serverless filesystem is read-only outside of `/tmp`. CSV imports already used in-memory parsing and needed no change.

The super admin can **unpublish** (suspend/activate), **edit** (name, slug, status, logo, admin credentials), and **delete** any shop from the dashboard. Deleting a shop removes all of its stores, products, batches, customers, and sales.

## Notes

- Auth uses JWTs returned in the response body and sent as `Authorization: Bearer` headers (stored client-side in `localStorage`) rather than cookies, since frontend and backend run on different origins in dev.
- A shop admin's token is scoped to their shop; the backend re-derives the shop from the URL slug and checks it against the token on every request, so one shop can never read another's data.
- Product search is backed by a `pg_trgm` GIN index (see `schema.prisma`) so it stays fast at the current ~17,000-row catalog and beyond.
- If Prisma commands fail on Windows with an `EPERM ... rename query_engine-windows.dll.node` error, a leftover `node.exe` from a previous `pnpm dev` run still has the engine file locked — stop that process first.
