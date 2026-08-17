# MediBox / Aster Pharmacy — Implemented Features

This file is a reference for AI agents working in this repo. It describes what exists today, where the code lives, and non-obvious business rules — so you don't have to re-read the entire codebase to get oriented. It reflects the state of the repo after "Phase 1" (rate limiting, Prisma schema split, shared frontend helpers), "Phase 2" (Redux migration for `ShopSessionContext`), and "Phase 3" (splitting the large frontend files into modular folders, and splitting `shopRoutes.ts` on the backend — see below). See **Known follow-ups** at the end for what is intentionally *not* done yet.

Stack: Next.js 16 (App Router) + React 19 frontend (`frontend/`); Express 4 + Prisma 5 backend (`backend/`); PostgreSQL (Neon). Multi-tenant: each `Shop` has its own `ShopAdmin` accounts (role `ADMIN`/`STAFF`), each with a `permissions: string[]` matching feature ids in `frontend/src/lib/menuFeatures.ts`.

---

## Architecture

- **Auth**: `backend/src/auth.ts`. Two JWT shapes — `{role:'SUPER_ADMIN', sub}` for platform superadmins, `{role:'SHOP_ADMIN', sub, shopId, shopSlug, adminRole, permissions}` for shop accounts, 12h expiry. `requireShopAdmin` resolves `:slug` → `Shop`, checks `status==='ACTIVE'`, and verifies the token's `shopId` matches the URL's shop (a shop token can never reach another shop). `requirePermission(...featureIds)` gates a route behind the account's `permissions` array (any-one-match, since some endpoints are shared across pages, e.g. customer lookup used by both Billing and Customer Registration).
- **Route files**: `backend/src/routes/shopRoutes.ts` was 2470 lines and has now been split (Phase 3) into `shopRoutes.ts` (114 lines — SHOP/SESSION + SETTINGS + ORGANIZATION), `stockDataRoutes.ts` (STOCK DATA + EXPIRE PRODUCTS + SOLD PRODUCT LEDGER), `billingRoutes.ts` (PRODUCT/BATCH SEARCH + SALES/BILLING + INVOICE ITEM CANCEL), `customerRoutes.ts` (CUSTOMERS), `dashboardRoutes.ts` (DASHBOARD, exports `aggregateSales`/`aggregateCogs`), `salesReportRoutes.ts` (SALES REPORT + Profit sub-reports), `csvImportRoutes.ts` (CSV IMPORT) — all mounted in `app.ts` at the same `/api/shops/:slug` base path, each starting with `router.use(requireShopAdmin)`, pure code motion verified byte-identical against the original. Plus the pre-existing dedicated files per newer module: `grnRoutes.ts`, `grnWithoutPoRoutes.ts`, `adjWithPoRoutes.ts`, `adjOthersRoutes.ts`, `vstRoutes.ts`, `rtvRoutes.ts`, `purchaseRequisitionRoutes.ts`, `purchaseOrderRoutes.ts`, `employeeRoutes.ts`, `authRoutes.ts`, `superadminRoutes.ts`.
- **Cross-file helper sharing (backend wart)**: several backend route files export plain functions consumed by sibling route files instead of a shared `lib/`/`services/` layer — e.g. `adminSelect`/`priceItems` from `purchaseRequisitionRoutes.ts`; `computeItem`/`priceGrnItems`/`grnInclude` from `grnRoutes.ts`; `remainingRtvAdjustableBalance` from `rtvRoutes.ts`. This works but is organic, not a designed module boundary — still open, see Known follow-ups.
- **`asyncHandler`** (`backend/src/asyncHandler.ts`) wraps every async Express handler for error propagation.
- **State management**: `ShopSessionContext.tsx` (token, shop info, stores, permissions; used by 39 files) is now Redux Toolkit-backed under the hood (Phase 2, done) — `frontend/src/store/store.ts`/`shopSessionSlice.ts` hold the state, `ShopSessionContext.tsx` still exports the exact same `useShopSession()`/`ShopSessionProvider` names and shapes, so none of the 39 consumers changed. A mount-only `dispatch(shopSessionReset())` in the provider replicates `useState`'s per-mount-fresh guarantee, since the Redux store (unlike component state) would otherwise survive unmount/remount across a logout/login. Per-view local state (filters, form drafts) is plain `useState` and intentionally stayed that way — out of Phase 2's scope. The Super Admin side (`session.getSuperAdmin()`) is separate and untouched.
- **Prisma schema**: split into `backend/prisma/schema/*.prisma` (one file per domain, via the `prismaSchemaFolder` preview feature) — `base.prisma`, `platform.prisma`, `organization.prisma`, `catalog.prisma`, `customers.prisma`, `sales.prisma`, `invoice-cancel.prisma`, `purchase-requisition.prisma`, `grn.prisma`, `vst.prisma`, `rtv.prisma`, `adj-others.prisma`, `employees.prisma`. 37 models, 20 enums total. No field/relation changes from the split — purely a file-layout move. Two later migrations: `GrnItem.rcvQtyBox`/`bonusQtyBox` and `PurchaseRequisitionItem.qtyBox` were widened `Int → Float` (fractional box quantities are a legitimate mirror of Pcs ÷ pack-size — e.g. 15 pcs at a 30-pack size is 0.5 box — and used to error on save); `Grn.invoiceVat Float @default(0)` was added alongside the existing `invoiceDiscount`/`expiryAdjustmentAmount`.
- **Mobile number validation**: every real mobile-entry field (Billing's lookup, Customer Registration's `AddCustomerModal` — reused by Billing's quick-add-customer flow too — and Employees) uses the shared `MobileNumberInput` (see Shared frontend helpers below): typing past 11 digits is blocked outright and pops a red top banner; `validateMobileNumber(value, {required})` is called at save time for the "must contain 11 digits" case. Search/filter fields that happen to be mobile-shaped (Invoice List's Mobile filter, Customer Registration's combined Mobile/EID-PF filter) were deliberately left as plain inputs — enforcing exactly 11 digits there would break partial-search and dual-purpose (EID-PF) use.
- **Rate limiting / perf middleware**: `backend/src/middleware/rateLimit.ts` — `apiLimiter` (300 req/15min, mounted on `/api`) and `authLimiter` (20 req/15min, mounted on `/api/auth` in front of `authRoutes`). `compression()` mounted globally in `app.ts` right after `cors()`.
- **Database indexes**: `Product` has `@@index`es on `shopId+name`/`genericName`/`dosageForm`/`departmentId`/`defaultSupplierId` plus GIN trigram indexes (`gin_trgm_ops`) on `name`/`genericName`/`externalCode` for fast `contains` search; `Sale` has `@@index`es on `shopId+createdAt`/`storeId+createdAt`/`shopId+cashierId` plus a trigram index on `invoiceNo`; `Customer` has `@@index`es on `shopId+mobile`/`orgName`/`custType`/`employeeId` plus trigram indexes on `mobile`/`customerCode`. Applied via migration `20260813174900_add_missing_indexes`.
- **Frontend 404**: `[shopSlug]/(app)/[module]/page.tsx` (the generic "Coming Soon" placeholder route) calls `notFound()` for any `module` param not in `ALL_FEATURE_IDS`, instead of rendering the placeholder for arbitrary strings; the 4 real placeholder features (`internal-issue`, `internal-receive`, `internal-requisition`, `req-central-warehouse`) still render "Coming Soon" exactly as before.
- **Shared frontend helpers**: `frontend/src/lib/format.ts` (`fmt`/`fmt4` number formatters), `frontend/src/components/admin/ComboSelect.tsx` (button+dropdown-panel combobox — `ComboOption`/`ComboSelect`, used by 7+ of the newer view files; now has arrow-key up/down navigation + Enter-to-select in its open dropdown panel, added this session — benefits every consumer automatically), `frontend/src/components/admin/SearchableSelect.tsx` (a **different**, older text-input-based combobox used by Stock Data / Expire Products — do not confuse the two, see Known follow-ups), `frontend/src/lib/numberToWords.ts` (`amountInWords()` for print reports), `frontend/src/components/admin/ItemEntryTypeahead.tsx` (debounced item-search row, used by GRN Without PO / VST — has its own independent arrow-key nav/Enter-select), `frontend/src/components/admin/PaginationBar.tsx` (the shared First/Previous/Page-X-of-Y/Next/Last footer, used by every paginated list screen — extracted in Phase 3 after confirming byte-identical behavior across all 12 consumers), `frontend/src/components/admin/ErrorBanner.tsx` (fixed top-center red banner for loud blocking messages — promoted out of `AsterBillingView/` this session so it could be reused), `frontend/src/components/admin/MobileNumberInput.tsx` (`MobileNumberInput`/`validateMobileNumber` — digits-only input capped at 11 chars, typing past the limit pops the shared `ErrorBanner`; used by Billing's mobile lookup, Customer Registration's `AddCustomerModal`, and Employees), `frontend/src/lib/proportionalSplit.ts` (`splitProportionally(total, weights)` — spreads an invoice-level Discount/VAT amount across line items by weight, last non-zero-weight item absorbs the rounding remainder; used by GRN With/Without PO and Adjust With PO's CALCULATE buttons).
- **Frontend file layout (Phase 3)**: `frontend/src/types/` and `frontend/src/services/` are split into per-domain files with barrel re-exports (`types/index.ts` does `export * from "./core"` etc.; `services/api.ts`'s `shopApi()` factory composes `services/shopApi/<domain>.ts` method groups via object spread) — no call-site changes anywhere, since every consumer already went through the barrel/factory. Each of the 10 large `Aster*View.tsx` components (`AsterBillingView`, `AsterCustomerRegistrationView`, `AsterAdjWithOthersView`, `AsterInvoiceListView`, `AsterVstView`, `AsterRtvView`, `AsterPurchaseOrderView`, `AsterGrnWithPoView`, `AsterAdjWithPoView`, `AsterGrnWithoutPoView`, `AsterPurchaseRequisitionView`) is now a folder (e.g. `components/admin/AsterGrnWithPoView/`) with `index.tsx` (the thin router/state component), one file per sub-view (`ListView.tsx`, `DetailView.tsx`, and `NewView.tsx`/`FormView.tsx` where applicable), and a `types.ts` for file-local draft interfaces/constants/helpers — a pattern that already existed inside each file (router + named sub-components) and was made mechanical (pure code motion, no logic changes) into separate files. `AsterBillingView` was the one exception without pre-existing List/Detail sub-components, so it instead got `constants.ts`/`helpers.ts`/`TypeaheadInput.tsx`/`ErrorBanner.tsx` pulled out of the main file, leaving the core state/JSX in `index.tsx` (still large — deliberately not split further into hooks, since that would risk behavior drift). `app/superadmin/page.tsx` similarly had its modal sub-components (`CreateShopModal`, `EditShopModal`, `ShopSalesModal`, `PermissionChecklist`, `SlugInput`) moved to `components/superadmin/`.
- **Print/report pattern**: no PDF library. Every module's "print" feature uses `window.open("", "_blank")` + `document.write(...)` + `window.print()`.
- **Counters**: sequential per-shop transaction numbers use dedicated `{shopId Int @id; value Int @default(0)}` counter models (`GrnCounter`, `GrnwCounter`, `GrnaCounter`, `VstCounter`, `RtvCounter`, `AdjOthersCounter`, `CustomerCounter`, `InvoiceCounter`, `RequisitionCounter`, `OrderCounter`), incremented via `tx.<counter>.upsert` inside the creating `$transaction` so numbers never collide under concurrency.
- **Menu / permissions (`frontend/src/lib/menuFeatures.ts`)**: single source of truth for both the MENU dropdown (`AsterHeader.tsx`) and the superadmin's grantable-permissions checklist (`PermissionChecklist.tsx`). Flat, not column-based: `MENU_FEATURES` (rendered in the dropdown as an auto-flowing `grid-cols-5`, 5-per-row — granting/revoking a permission just closes the gap and reflows instead of leaving a fixed column short/ragged) excludes `employees`/`employee-salary`/`expenses`, which instead live in `DASHBOARD_FEATURES` and render as buttons on the Pharmacy Dashboard (see Dashboard above) rather than in the dropdown. `ALL_FEATURES`/`ALL_FEATURE_IDS` = the union of both, used by `PermissionChecklist.tsx` (so Dashboard-hosted features are still grantable) and by the route-gating check in `[shopSlug]/(app)/layout.tsx` (`isGatedRoute = ALL_FEATURE_IDS.includes(activeRoute)`, generic — works for any feature id without per-route code). MENU dropdown footer text is `{shopName} - Powered by: AtovixSoft`.

---

## Billing

The POS screen. **Backend**: `billingRoutes.ts` SALES/BILLING section. **Frontend**: `AsterBillingView.tsx`.

- `GET /products/search?q=&storeId=` — batch-level typeahead by name/generic/barcode; only in-stock (`stockQty>0`), non-expired batches; prefix matches ranked first, capped 20.
- `GET /products/by-barcode/:barcode?storeId=` — exact batch lookup.
- `POST /sales` — creates the sale inside one `$transaction`: revalidates every line against the live `Batch` (never trusts client totals), computes VAT on `(lineAmount - lineDiscAmt)` (not raw price), decrements stock, rounds the bill to the nearest integer (delta stored as `adjustAmount`), and validates payment.
- `GET/POST /customers` — shared with Customer Registration.

Non-obvious rules:
- **Walk-in auto-creation**: if no customer selected, creates a `Customer` from `CustomerCounter` with `custType: GENERAL`, name `WALK-IN CUSTOMER`, placeholder mobile `00000000000`.
- **Credit rule**: a due amount is only allowed if `customer.creditLimit > 0` AND `dueAmount <= creditLimit - creditBalance`. Fully-paid bills bypass this check entirely, even for walk-ins.
- **Invoice numbering**: per-store `InvoiceCounter`, format `INV-{year}-{6-digit}`.
- **Reward**: `rewardEarned = netAmount * shopSetting.rewardEarnRatePct/100`, computed server-side only — the Billing UI's "Reward" column is hardcoded `0` and never reflects this before submit.
- Due amount is added to `customer.creditBalance` (consumed credit) on success.
- `Sale.shift` is auto-derived from wall-clock hour (`<15` → `MORNING`, else `EVENING`) — used later by the Sales Report shift filter.
- Frontend fires `window.dispatchEvent(new CustomEvent("medibox:sale-created"))` after submit so an open Dashboard tab refreshes immediately.

Models: `Sale`, `SaleItem`, `Batch`, `Customer`, `CustomerCounter`, `InvoiceCounter`, `ShopSetting`.

---

## Customer Registration

**Frontend**: `AsterCustomerRegistrationView.tsx` (also exports `AddCustomerModal`, reused by Billing). **Backend**: `customerRoutes.ts` CUSTOMERS section.

- `GET /customers` (permission `customer-registration` or `billing`) — filters: `storeId`, `custType`, `gender`, `customerCode`, plus a free-text box OR'd across `mobile`/`employeeId`/`name`/`customerCode`.
- `POST/PUT /customers` — **credit limit is server-zeroed for any `custType` other than `VVIP`**, regardless of what the client sends. Duplicate mobile → 409.

`custType` drives which optional fields the modal shows (`VVIP` → Credit Limit/Balance; `EMPLOYEE` → Org Name/Designation/Employee ID); backend independently re-enforces the VVIP-only credit rule.

Models: `Customer`, `CustomerCounter`, `Store`.

---

## Stock Data

Read-only paginated `Product` × `Batch` grid. **Frontend**: `AsterStockDataView.tsx`. **Backend**: `stockDataRoutes.ts` STOCK DATA section, raw SQL via `buildStockDataQuery`.

- `GET /stock-data` — requires `storeId`; filters `type` (`AVAILABLE`/`ZERO` via `stockQty`), `dosageForm`, `generic` (partial), `departmentId`, `supplierId`, `search`.
- `GET /stock-data/export` — same filters → XLSX.
- `GET /products/dosage-forms`, `GET /products/generics` — distinct value lists for filters.

"Last Sold Date" = `COALESCE(MAX(sale date via SaleItem), Product.lastSoldSnapshot)` — falls back to a snapshot column when there's no live sale history in this store (e.g. freshly cloned catalog).

**Non-Pharma department fix**: the original `scripts/importMedicineData.ts` hardcoded every imported product into a single "Pharma" `Department` row — "Non-Pharma" never existed, so selecting it always returned zero products (and, as a side effect, silently broke every `mode=NON_PHARMA` filter across Purchase Requisition/VST/RTV/Adjust With PO, all of which query `d.name = 'Non-Pharma'`). Fixed two ways: (1) the import script now classifies each row's `CATEGORY NAME` via `isPharmaCategory()` — categories coded like `G-01-(01) ORAL ANTIBIOTIC` or `(24) FREEZING-INSULIN` are Pharma, plain-named ones (`GENERAL TOILETRIES`, `TOYS`, `DRINKS & BEVERAGES`, ...) are Non-Pharma — so a future re-import lands correctly; (2) `scripts/fixDepartments.ts` (one-off, already run) backfilled the already-imported shop's data using the same rule, moving ~5,965 of ~17,000 products (and their `SubDepartment` rows) into a newly-created "Non-Pharma" department. A few category names were ambiguous under this heuristic (`FREEZING OTHERS`, `SPORTS PHARMACY`, `SURGICAL & MEDICAL DEVICES`, `UNCATEGORIZED`) and were classified Non-Pharma by default — worth a manual spot-check if any of those turn out wrong for a given shop.

Models: `Product`, `Department`, `Supplier`, `Batch`.

---

## Edit Stock

The Stock Data grid again — identical filter panel, columns, pagination and XLSX export — but with four columns writable straight in the grid: **Display Category**, **Purchase Price**, **Sales Price**, **Box Qty**. Applies to the whole cloned catalog (~17k items). **Frontend**: `AsterEditStockView.tsx`. **Backend**: `stockDataRoutes.ts` EDIT STOCK section, sharing `buildStockDataQuery` plus the `stockGridColumnsSql` / `stockGridExportColumnsSql` column lists with Stock Data so the two grids can't drift apart.

- `GET /edit-stock` — same params as `/stock-data`, plus `productId`/`batchId` per row so a save can target the exact row shown. Ordered `p.name, p.id, b.id` (Stock Data sorts on name alone) so rows being edited can't shuffle between the read and the save.
- `PATCH /edit-stock` — `{ storeId, updates: [{ productId, batchId, displayCategory?, purchasePrice?, salesPrice?, boxQty? }] }`. One request carries every edited row on the page and runs in a single transaction, so a page of edits lands completely or not at all. Only fields the user actually changed are sent.
- `GET /edit-stock/export` — same filters → XLSX (`edit-stock.xlsx`).
- `/products/dosage-forms`, `/products/generics`, `/products/stock-search-suggest` now accept `stock-data` **or** `edit-stock`, since one filter panel serves both screens.

**Edit scope follows the table each column lives in**: Display Category and Box Qty are `Product` columns, so they change the item everywhere (all warehouses); Purchase Price and Sales Price are `Batch` columns, so they only touch the batch shown for the selected warehouse. A row whose item has no batch in that warehouse (`batchId: null`) has both price cells locked — there is nothing to write to until a GRN receives it. The grid re-reads after every save so catalog-wide edits show up in all of that item's rows.

Validation (server-side, mirrored in the grid): Box Qty must be a whole number ≥ 1; prices must be ≥ 0 and are rounded to paisa on the way in; a cleared Display Category stores `NULL`, not `""`; ownership is re-checked per row (product belongs to this shop, batch belongs to that product *in that warehouse*) so a tampered payload can't reach another shop's data; max 200 rows per save.

Sales Price writes `Batch.sellingPrice`, which is what Billing charges — so the grid flags a Sales Price below Purchase Price, since `billingRoutes.ts` refuses to sell below cost and would otherwise fail later at the counter.

Models: `Product`, `Batch`.

---

## Create Stock

Hand-enters a new catalog item using the Stock Data columns that are actually data entry. **Frontend**: `AsterCreateStockView.tsx`. **Backend**: `stockDataRoutes.ts` CREATE STOCK section.

- `GET /create-stock/next-item-no` — preview of the code the next item will get.
- `POST /create-stock` — creates the `Product` plus one opening `Batch`, in a transaction.
- `GET /products/display-categories` — distinct values already in use, offered as a picklist so a typo can't invent a near-duplicate category that splits the Stock Data filter. Accepts `stock-data`, `edit-stock` or `create-stock`.

**Item No is never typed.** `nextItemNo()` takes the numerically highest `externalCode` in the shop, adds one, and keeps that code's prefix and digit width. This shop's catalog runs `APH100001..APH113580` (6 digits) and then `APH100113581..APH100117251` (9 digits) — two widths — so anchoring on the numerically highest code continues the live sequence and cannot collide with either family; a shop numbering some other way is followed just as well. A `P2002` on `(shopId, externalCode)` re-reads and retries up to 5 times, so simultaneous entries each get their own code (verified with 4 concurrent creates).

**Excluded from entry, by design**: Item No (generated), Last Req. Date and Last Sold Date — those are history, and Stock Data already derives them from real `PurchaseRequisition` / `Sale` rows, falling back to the `lastPurchaseReqDate` / `lastSoldSnapshot` columns which stay NULL for a hand-created item.

Fields: Item Name, Generic, Display Category, Department, Sub-Department, Manufacturer, **Item Type**, **UOM**, **Re-order Level**, Box Qty, Purchase Price, Sales Price, Warehouse. Item Type writes `Product.dosageForm` — the same column the Stock Data filter labels "Dosage", sourced from the import's ITEM TYPE NAME. UOM writes `Product.unit` (surfaced as `uom` in Billing/GRN/PR/RTV/VST, defaulting to `Pcs`), and Re-order Level writes `Product.reorderLevel`, which drives the Purchase Requisition reorder list. `GET /products/units` and `GET /products/display-categories` back the picklists so entries stay consistent with the existing catalog.

**Stock always starts at zero, by design.** Creating an item is a catalog entry, not a receipt of goods, so there is no Stock Qty or Expiry Date input — quantity (with its real batch number and expiry) arrives through GRN With PO / GRN Without PO, which add their own batch and increment stock on approval. A `stockQty` or `expiryDate` sent in the payload anyway is ignored rather than honoured.

Purchase Price and Sales Price live on `Batch`, not `Product`, so the form takes a Warehouse and the new item gets one opening batch there — `batchNo` `OPEN-<itemNo>`, barcode `<itemNo>`, `mrp` = Sales Price, `stockQty` 0, mirroring the reference batches `catalogClone` lays down for the imported catalog. `Batch.expiryDate` is required by the schema but a zero-quantity opening row has no real expiry to state, so it takes the same two-years-out placeholder those reference batches carry. Sub-Department is validated against the chosen Department; Department, Manufacturer and Warehouse are all re-checked against the shop.

Models: `Product`, `Batch`, `Department`, `SubDepartment`, `Supplier`, `Store`.

---

## Expire Products

Lists batches nearing/past expiry with filtering and export (built this session). Follows the same raw-SQL / filter-panel pattern as Stock Data — see `AsterExpireProductsView.tsx` and the corresponding `stockDataRoutes.ts` section for exact filter params.

---

## Sold Product Ledger

Per-product sale history ledger (built this session) — see `stockDataRoutes.ts` and the corresponding view for exact endpoint/params; follows the ledger-row pattern also used by Sales Report.

---

## Invoice List

**Frontend**: `AsterInvoiceListView.tsx`. **Backend**: `billingRoutes.ts`, shares `buildInvoiceListWhere` with Sales Report.

- `GET /sales` (permission `sales-report` or `invoice-list`) — paginated via `buildInvoiceListWhere`: `storeId`, `cashierId` (as `userId`), `invoiceNo` (contains), `createdAt` range (`to` extended to end-of-day), nested `customer.is{orgName, customerCode, mobile, employeeId}`.
- `GET /sales/organizations` — distinct `customer.orgName` values, feeds the separate **Organization** filter.
- `GET /sales/export` — XLSX, capped 5000 rows.
- `GET /sales/:id` (permission `sales-report`, `invoice-list`, or `billing`) — single invoice for print/re-print.
- `POST /sales/:id/receive` (permission `invoice-list` or `billing`) — collects payment on a DUE invoice; caps at `dueAmount+0.01`; reduces `customer.creditBalance`; sets `paymentStatus: PAID` once `dueAmount<=0.01`.

The UI's "Report" dropdown (Initial/Modified) is local state only — not wired to any backend param. Default date range on load is today→today; no auto-fetch on mount.

**Cust.Type filter** (fixed this session): the filter used to be wired to `orgName` under a misleading "Cust.Type" label, so it always looked empty for the vast majority of walk-in/general customers. There are now two separate filters — **Cust.Type** (real `Customer.custType` enum: GENERAL/EMPLOYEE/OTHER/VVIP, `custType` query param) and **Organization** (the original org-name filter, unchanged). Both flow through `buildInvoiceListWhere` (shared with Sales Report and Dashboard's Due Collection tab).

**Due Collection** (fixed this session): `buildInvoiceListWhere` accepts a `dueOnly` param (`where.dueAmount = {gt: 0.01}`) — used by the Dashboard's Due Collection tab, which renders `AsterInvoiceListView` itself with `dueOnly` (and no default date-range restriction, since overdue invoices can be from any date) rather than a separate component.

---

## Invoice Item Cancel

Cancels individual line items on an already-billed invoice. Populates `SaleItemCancellation`, restocks the batch (`Batch.stockQty` incremented by the canceled qty), and reduces `Sale.paidAmount`/increments `Sale.refundAmount` (capped at what remains paid). See `AsterInvoiceItemCancelView.tsx` and its `billingRoutes.ts` section (`POST /sales/:id/cancel-items`) for exact validation rules (e.g. cannot over-cancel beyond originally sold qty). Lookup (`GET /sales/by-invoice-no`) trims stray whitespace so a pasted invoice number still matches.

**Gap** (unchanged): `SaleItemCancellation` data is read by the Pharmacy Sales Report (Profit) reports (which subtract canceled qty proportionally — see below) and by User-Wise Collection Summary's Refund column, but `PHARMACY_CANCEL_SUMMARY`/`PHARMACY_CANCEL_DETAILS` specifically are still stubbed — see Known follow-ups.

---

## Sales Report

**Frontend**: `AsterSalesReportView.tsx`. **Backend**: `salesReportRoutes.ts` SALES REPORT section, `GET /reports/sales` + `/reports/sales/export`.

All reports share one flat row shape (`LedgerRow`: leaf invoice rows, group-header rows, per-group "Total:" rows, a final "Grand Total" row) built from `fetchSaleLedgerBase` (raw SQL joining `Sale`→`Store`→`ShopAdmin`→`Customer`, with a lateral subquery for COGS from `SaleItem`/`Batch`).

Wiring status by report name:
| Report | Status |
|---|---|
| `INVOICE_WISE_DETAILS` | Wired |
| `PHARMACY_WISE_SUMMARY` | Wired (grouped by store) |
| `ITEM_WISE_DETAILS` | Wired (separate query, grouped by product/generic/department) |
| `DATE_WISE_SUMMARY` / `DATE_WISE_DETAILS` | Wired |
| `USER_WISE_DETAILS` | Wired |
| `USER_WISE_COLL_SUMMARY` | Wired — `refund` now reads real `Sum(Sale.refundAmount)` per cashier (was hardcoded `0`); `netCollection = totalCollection - refund` |
| `PHARMACY_DUE_DETAILS` | Wired (`dueRows` shape, filters `due>0.01`) |
| `DUE_COLLECTION_DETAILS` | Wired (`dueRows`, filters `due>0.01 AND currentCollection>0.01`) |
| `PHARMACY_CANCEL_SUMMARY` / `PHARMACY_CANCEL_DETAILS` | **Still stubbed** — always returns `ledgerRows: []` (see Known follow-ups) |
| `PROFIT_DEPT_SUMMARY` / `PROFIT_SUBDEPT_SUMMARY` / `PROFIT_ITEM_WISE` / `PROFIT_SUPPLIER_SUMMARY` / `PROFIT_SUPPLIER_TOP_SHEET` / `PROFIT_SUPPLIER_DETAILS` | Wired — new "Pharmacy Sales Report (Profit)" `<optgroup>` in the Report Name dropdown |

Every `current/previousCancel`, `current/previousCogsCancel`, `current/previousVatCancel`, `current/previousRefund` field on the `LedgerRow`-shaped reports is still hardcoded to `0` — untouched, not part of the Profit reports below. Export (`/reports/sales/export`) still only implements the flat ledger-base XLSX shape regardless of `reportName` — the new Profit reports and `USER_WISE_COLL_SUMMARY`/`*_DUE_DETAILS` don't get a matching Excel export yet.

### Pharmacy Sales Report (Profit)

Six new sub-reports, all built from one shared per-`SaleItem` base query (`fetchProfitReportBase`, raw SQL joining `SaleItem`→`Sale`→`Store`/`Product`→`Department`/`SubDepartment`/`Supplier`(via `product.defaultSupplierId`, falling back from `SaleItem.supplierSnapshot`)→`Batch`). Quantities/money are pre-reduced for partial Invoice-Item-Cancel (`qty - canceledQty`, scaled proportionally) so every figure reflects what's actually still sold.

- `groupSum()` aggregates qty/COGS/Sales Value/Discount/VAT/Net Amount/Profit for a set of rows; `profitPctBefore = (salesValue-cogs)/salesValue*100` (mirrors this app's product-level GP% convention — profit as a share of sale value); `profitPctAfter = (netAmount-cogs)/netAmount*100` (same ratio net of discount/VAT).
- `PROFIT_DEPT_SUMMARY` — grouped by (store, department), with a Sub-Total row per store and a Grand Total.
- `PROFIT_SUBDEPT_SUMMARY` — grouped by sub-department only, one Grand Total.
- `PROFIT_SUPPLIER_SUMMARY` — grouped by (store, supplier), Sub-Total per store + Grand Total.
- `PROFIT_SUPPLIER_TOP_SHEET` — grouped by (supplier, department), flat rows sorted by supplier name, both before/after-discount GP% plus Gross Profit (`salesValue-cogs`) and Net Profit (`netAmount-cogs`).
- `PROFIT_ITEM_WISE` / `PROFIT_SUPPLIER_DETAILS` — no grouping, one row per sold line item with full item/pricing detail (item code, batch's PP, sale-time MRP, dosage form, display category, etc.).

Frontend: `PROFIT_REPORT_NAMES` renders as an `<optgroup label="Pharmacy Sales Report (Profit)">` inside the existing Report Name `<select>`; `ProfitReportTable` dispatches to `ProfitSummaryTable` / `ProfitTopSheetTable` / `ProfitDetailTable` based on `reportName`.

---

## Dashboard

**Frontend**: `AsterPharmacyDashboardView.tsx`. **Backend**: `dashboardRoutes.ts` DASHBOARD section, `GET /dashboard`, via `aggregateSales(shopId, storeId?, from, to)`.

- `sales.total` = `Sum(Sale.netAmount)` in range.
- `collection.total` = `Sum(Sale.paidAmount where paidAmount>0)` **plus `adjustment`**.
- `adjustment` (this session's addition) = `Sum(Grn.rtvAdjustmentValue)` for `Grn.kind='ADJUST_WITH_PO'` **plus** `Sum(AdjOthers.totalAdjustmentAmount)`, both filtered `status='APPROVED'` and `approvedAt` in range — RTV-credit adjustments approved in the window are treated as collected value (pharmacy keeps value instead of paying a supplier), not tracked as a separate line in the UI.
- Route also computes `purchase`, `payment` (non-credit purchases), and `daily`/`monthly`/`yearly` aggregates — all returned by the API but **currently unused in the UI**, which only renders the Collection card (cash/mobile/card/adjustment breakdown + invoice count).
- Auto-refresh: `medibox:sale-created` custom event, tab `visibilitychange`/`focus`, and a 20s poll interval.

**Due Collection tab**: a `Collection` / `Due Collection` toggle at the top of the page. `Due Collection` renders `AsterInvoiceListView` itself with `dueOnly` (see Invoice List above) instead of a separate component — same filters/pagination/RECEIVE-payment action as Invoice List, just pre-scoped to outstanding dues and with no default date restriction. `AsterInvoiceListView` takes an optional `heightClassName` prop (defaults to its normal full-viewport height) so it can be embedded below the tab bar without a layout conflict.

**Dashboard-hosted feature buttons**: Employees, Employee Salary, and Expenses are no longer in the MENU dropdown (see Architecture/Menu below) — instead they render as a row of buttons on the Collection tab, below the Store/date-filter bar, filtered to `DASHBOARD_FEATURES.filter(f => permissions.includes(f.id))` (same permission-gating as the MENU dropdown, just a different render location) and navigating via `router.push`. The Employees/Employee Salary pages themselves are unchanged — only their entry point moved.

Models: `Sale`, `Grn`, `AdjOthers`.

---

## Purchase Requisition & Purchase Order

**Backend**: `purchaseRequisitionRoutes.ts`, `purchaseOrderRoutes.ts`. **Frontend**: `AsterPurchaseRequisitionView.tsx`, `AsterPurchaseOrderView.tsx`.

**Key mechanism**: Purchase Order is *not* a separate table — `purchaseOrderRoutes.ts` operates on the same `PurchaseRequisition` model, scoped to `status IN ('APPROVED','FINAL_APPROVED')`.

Lifecycle: `UNAPPROVED` (editable requisition) → `POST /purchase-requisitions/:id/approve` → `APPROVED` (now visible/editable in Purchase Order screen: `deliverToStoreId`/`paymentMode`/`expectedDate`/items) → `POST /purchase-orders/:id/final-approve` → `FINAL_APPROVED` (assigns `orderNo` = `PO{year}{month}{6-digit}` from `OrderCounter`, locks further edits).

- `GET /purchase-requisitions/items` — bulk pricing/consumption grid per supplier: qty-on-hand (store-scoped `Batch`), pricing (falls back cross-store to the product's most recent batch if never received in this store), consumption (`Sum(SaleItem.qty)` over a `days` window). `reorderBelow=true` additionally requires at least one APPROVED GRN in this store for that product.
- `POST /purchase-requisitions` — `RequisitionCounter` → `PR-{year}-{5-digit}`; `priceItems()` computes `totalPPAmount`/`totalMrpAmount`/`avgGpPct`; requires ≥1 item with qty>0.
- `PUT` on either — blocked once status has moved past the stage that route manages ("An approved requisition can no longer be edited" / blocked once `FINAL_APPROVED`).
- Both `/approve` and `/final-approve` are idempotent.

Non-obvious: `qtyBox` and `qtyPieces` are **not additive** — they mirror the same requested quantity (kept in sync client-side via box size); `qtyPieces` is the source of truth for `totalValue = ppPerPiece * qtyPieces`. Purchase Order's own `DetailView.tsx` had a separate, now-fixed instance of the same additive bug in its row-rendering/`totals` memo (the shared backend `priceItems()` was already correct — only the frontend preview was wrong).

**Status display bug (fixed)**: Purchase Requisition's `ListView.tsx` badge used to do `status === "APPROVED" ? "Approved" : "Unapproved"` — a binary check that mislabeled `FINAL_APPROVED` rows as "Unapproved" (since the list has no status filter, a requisition that had progressed all the way to a Final-Approved Purchase Order still shows here, now correctly labeled via a shared `statusLabel()`). A **Status** filter (`ALL`/`UNAPPROVED`/`APPROVED`/`FINAL_APPROVED`) was added, wired to a new `status` param on `GET /purchase-requisitions`.

**Purchase Requisition `FormView.tsx`**: the product grid used to require a manual "ADD" click next to Supplier (`loadGrid()`) — confusingly labeled the same as the quick-add row's own "ADD" button (which actually adds an item). The grid now auto-loads via a `useEffect` on `loadGrid`'s dependencies (Store/Supplier/Mode/Con Days/Reorder-Below), and the redundant button was removed — the quick-add-by-typing flow (`SearchableSelect` → focus jumps to Req(Box) → Enter/ADD commits, pinning the item to the top via `reorderBySelection`) already existed and needed no changes.

**Purchase Order list filters** (fixed): "Type" and "Req. Mode" used to be silently bound to the *same* `mode` state (Pharma/Non-Pharma only) — split into independent filters. "Type" is now a `poStatus` param (`PENDING` = `status='APPROVED'`; `DONE` = `status='FINAL_APPROVED'`; `PENDING_TO_GRN` = `FINAL_APPROVED` AND `grns: {none: {}}` — no GRN raised against it yet, via the `PurchaseRequisition.grns` reverse relation); "Req. Mode" keeps the original Pharma/Non-Pharma `mode` filter. A date-range picker (`from`/`to` against `approvedAt`, already supported server-side) was added next to Search.

**Purchase Order edit "For Store"** (fixed): `deliverToStoreId` now defaults to `order.storeId` (the store that raised the requisition) when unset, instead of staying blank — `String(o.deliverToStoreId || o.storeId)`.

**Purchase Order item search** (fixed): reuses the shared `ComboSelect` (see Architecture — now has arrow-key navigation, see below), and selecting an item focuses the Order(Box) input (`ordBoxRef`), which now also commits on Enter (`handleQuickAdd()`) — previously only the ADD button worked.

**Purchase Order PDF export** (rebuilt): both `ListView.tsx`'s per-row "PDF" button and `DetailView.tsx`'s "REPORT" button (which used to just call `window.print()` on the live screen) now generate the same formatted document — shop header, two-column Vendor/Order-No/Contact/Date/Delivery-Address/Delivery-Date/Delivery-To/Remarks meta block, item table (Item Code/Product Name/UOM/Pack Size/Order Qty Box+Pcs/Unit Price/MRP/Total Price), total line, a 3-column Prepared-By/Reviewed-By/Approved-By signature row (blank — actual signature images are a separate future superadmin/Cloudinary feature), and the 7 standard PO terms & conditions. No PDF library is used (same `window.open` + `document.write` + `window.print()` pattern as every other module's report).

Models: `PurchaseRequisition`, `PurchaseRequisitionItem`, `RequisitionCounter`, `OrderCounter`.

---

## GRN With PO

Goods Receipt against an approved Purchase Order. **Backend**: `grnRoutes.ts` (exports `computeItem`/`priceGrnItems`/`grnInclude`, reused by GRN Without PO and Adjust With PO). **Frontend**: `AsterGrnWithPoView.tsx`.

Counter: `GrnCounter`. `Grn.kind = STANDARD`, `purchaseOrderId` set. See route file for exact variance/pricing rules against the source PO.

**Invoice Discount / Invoice VAT — live distribution** (mirrored identically in Adjust With PO and GRN Without PO below): the bottom Invoice Discount and Invoice VAT boxes distribute across every line item's own Discount/VAT cell proportional to that item's Total Value (`lib/proportionalSplit.ts`'s `splitProportionally(total, weights)` — the last non-zero-weight item absorbs the rounding remainder so the parts always sum back to exactly the typed amount). This fires **live from the input's `onChange`** (an `applyCalculate(discount, vat)` helper called with the just-typed value, not stale state) rather than only on a button click or via a `useEffect` — a `useEffect` watching the values would re-clobber manually-edited item cells on unrelated re-renders, and a click-only approach didn't satisfy "should automatically populate." The CALCULATE button still exists as a redundant explicit re-apply. `Grn.invoiceDiscount`/`Grn.invoiceVat` are kept as persisted fields for display/audit only — since the distributed item-level `discAmt`/`vatAmt` already flow into `netTotal` (and therefore `netAmount`), they are **not** subtracted a second time in the backend's `netAmount` formula (a real double-subtraction bug this fixed: the old formula did `sum(netTotal) - invoiceDiscount`, which would have double-counted once the discount was also distributed into items). `expiryAdjustmentAmount` remains a separate, undistributed top-level deduction.

**List/detail/approve now correctly scoped to GRN-with-PO rows**: `GET /`, `GET /:id`, `PUT /:id`, and `POST /:id/approve` all filter `purchaseOrderId: { not: null }, kind: 'STANDARD'`. Previously the list route had no filter at all (`where: { shopId }`), so GRN Without PO rows (`kind='STANDARD'`, `purchaseOrderId=null`) and Adjust With PO rows (`kind='ADJUST_WITH_PO'`) leaked into the GRN With PO screen — confirmed via live query (14 total `Grn` rows for the test shop, only 6 were genuine GRN-With-PO).

**Received By is now optional for GRN With PO only** (`Grn.receivedById Int?`, `receivedBy ShopAdmin?` — nullable in schema; the create/approve routes no longer require it). This was previously mandatory here; GRN Without PO and Adjust With PO were **not** changed and still require it, per explicit scope. `receivedById` is normalized to `receivedById ? Number(receivedById) : null` on write so an empty-string selection saves as `null`, not an invalid `0` FK.

**Print report** (`handleReport`) was a bare `window.print()`; rebuilt to match GRN Without PO's formatted template (header/meta grid including Received By, item table, totals block with Invoice Discount/Invoice VAT/Exp. Adjustment/Net Amount, amount-in-words, 3-way signature row) — this is also the fix for "the Adjustment field doesn't show its reflection anywhere on the invoice," since the calculation itself was already correct end-to-end; what was missing was a report that displayed it.

**Per-batch pricing already correct** (verified, no code change needed): a GRN's approval upserts `Batch` keyed by `(productId, storeId, batchNo)` with that GRN's own `purchasePrice`/`mrp` — so if a later batch of the same product is received at a different price, both batches keep their own price and show up separately (not aggregated) in Stock Data (`buildStockDataQuery`) and in Billing's item search (`/products/search`), confirmed against live multi-batch data.

---

## GRN Without PO

Direct goods receipt with no prior requisition/PO (built this session). **Backend**: `grnWithoutPoRoutes.ts`. **Frontend**: `AsterGrnWithoutPoView.tsx`. Counter: `GrnwCounter`.

Non-obvious: a `bonusAffectsPricing` opt-in flag controls whether bonus (free) quantity is excluded from average-cost pricing math — off by default, matching how bonus stock is normally treated as free rather than cost-diluting.

Item entry uses the shared `ItemEntryTypeahead.tsx` component — its search dropdown now shows item code + PP + MRP in the sublabel (was name-only), and the staging "Add Item" row has a second line (Bonus Qty, VAT, Discount, Batch, Expiry Date, plus a live computed Total Amount preview) so all of that is entered before the row is committed, not just after.

**Total Value is now a genuinely editable per-line field** (`GrnItem.totalValue`, already existed in the schema but was previously always re-derived as `tradePrice * qty` and never accepted from the client). `computeItem()`/`priceGrnItems()` (shared with GRN With PO/Adjust With PO — see above) now accept an optional `totalValueOverride`; only GRN Without PO's routes send `items[].totalValue`, so GRN With PO/Adjust With PO are unaffected and keep deriving it from the PO's locked-in price. Editing Total Value re-derives Unit Price as `(totalValue + vatAmt - discAmt) / rcvQtyPieces`, which is what gets written to `Batch.purchasePrice` on approval — this is also the fix for "GRN Without PO items don't show a Purchase Price in Stock Data/VST": that happened whenever `tradePrice` (`batch?.purchasePrice ?? 0`) had no prior batch to inherit from (e.g. a genuinely new product, or one of the ~48 shop-wide `OPEN-`-batch opening-stock rows seeded with `purchasePrice=0`), and there was previously no way to type in the real price. Pack Size and RcvQty(Box) are also now cross-editable (`setPackSize` recomputes `rcvQtyBox` from the existing `rcvQtyPieces`, keeping Pcs as the anchor).

---

## Adjust With PO

Adjusts a GRN's payable amount using RTV credit balance from the same supplier, tied to a PO (built this session). **Backend**: `adjWithPoRoutes.ts`. **Frontend**: `AsterAdjWithPoView.tsx`. Counter: `GrnaCounter`. `Grn.kind = ADJUST_WITH_PO`.

Non-obvious:
- `Grn.netAmount` is **repurposed** as "Net Payable" specifically for `ADJUST_WITH_PO` rows (differs in meaning from a `STANDARD` GRN's `netAmount`).
- `Grn.via: RtvVia?` (Warehouse/Head Office) is only meaningful for `ADJUST_WITH_PO` rows; null for `STANDARD` GRNs. (This field exists because an earlier draft incorrectly repurposed `transactionRefNo` for this — fixed via a proper additive field before this session's schema-split work.)
- RTV credit consumption is tracked via the `GrnRtvAdjustment` join table and the shared `remainingRtvAdjustableBalance()` helper (exported from `rtvRoutes.ts`), which is also used by Adjustment With Others — the two features draw from the same pool of available RTV credit per supplier, so both must be considered together when reasoning about "how much credit is left."
- The bottom Discount box follows the same live-on-`onChange` distribute-into-item-cells mechanism as GRN With PO/Without PO (see above) — `applyCalculate()` spreads `invoiceDiscount` across items' `discAmt` via `splitProportionally` as soon as the value is typed (CALCULATE remains as a redundant manual re-apply), and `netPayable`'s formula was fixed the same way (no longer double-subtracts `invoiceDiscount` on top of the now-populated `totalDiscount`).
- RTV No. picker (`/rtv-options` on both this and Adjustment With Others) used to also require `storeId` before returning anything, even though an RTV's remaining credit is owed by the supplier shop-wide, not scoped to the store it was originally returned from — `storeId` is no longer required server-side, and the frontend fetch/dropdown no longer gates on Store being picked first (Supplier alone is enough).

---

## Adjustment With Others

Adjusts non-PO-tied amounts (e.g. other payables) using RTV credit balance (built this session). **Backend**: `adjOthersRoutes.ts`. **Frontend**: `AsterAdjWithOthersView.tsx`. Counter: `AdjOthersCounter`. `AdjOthersType`/`AdjStatus` enums.

Shares `remainingRtvAdjustableBalance()` with Adjust With PO (see above) via the `AdjOthersItem` join table — same shared credit pool.

---

## Virtual Stock Transfer (VST)

Transfers stock between stores within the same shop without a physical GRN (built this session). **Backend**: `vstRoutes.ts`. **Frontend**: `AsterVstView.tsx`. Counter: `VstCounter`, `VstStatus` enum. Item entry uses the shared `ItemEntryTypeahead.tsx` component.

---

## Return To Vendor (RTV)

Returns stock to a supplier, generating RTV credit balance consumable by Adjust With PO / Adjustment With Others (built this session). **Backend**: `rtvRoutes.ts` (exports `remainingRtvAdjustableBalance`). **Frontend**: `AsterRtvView.tsx`. Counter: `RtvCounter`. `RtvVia` (Warehouse/Head Office), `RtvStatus` enums.

**VST picker fix**: `GET /vst-options` used to list every `APPROVED` VST for the store/supplier regardless of how much of it had already been returned — a VST whose entire quantity had already been returned via a prior RTV would still show up with nothing left to select. It now fetches each VST's items alongside a `RtvItem.groupBy` sum of already-returned qty per `vstItemId` (same computation `GET /vst/:vstId/items` already did per-item) and drops any VST where every item's `vstQtyPieces - alreadyReturned <= 0`. A VST with only some quantity returned (e.g. 10 of 20 pcs) still appears, for the remaining balance.

---

## Employees & Employee Salary

**Backend**: `employeeRoutes.ts` (gated by `requirePermission('employees','employee-salary')`). **Frontend**: `AsterEmployeesView.tsx`, `AsterEmployeeSalaryView.tsx`.

- Employees: standard CRUD on `Employee` (name, address, mobile, age, education, `salary` = default monthly gross).
- Salary routes are registered **before** `/:id` routes in the file — a documented Express route-order fix (otherwise `/:id` would swallow `/salaries` as `id="salaries"`).
- `GET /salaries?month=YYYY-MM` — every employee LEFT-joined to their `EmployeeSalary` row for that month; a missing record is synthesized as `{status:'UNPAID', amount:0}`.
- `POST /salaries` — upsert on `(employeeId, month)`; marks `PAID`, `amount` defaults to `employee.salary` if not given.
- `DELETE /salaries/:id` — reverts a payment (deletes the row, back to synthesized UNPAID).
- Deleting an `Employee` cascades to delete their `EmployeeSalary` history (`onDelete: Cascade`) — the frontend's delete-confirm dialog explicitly warns about this.

---

## Expenses

Simple daily expense ledger (new). **Backend**: `expenseRoutes.ts` (gated by `requirePermission('expenses')`, mounted at `/api/shops/:slug/expenses`). **Frontend**: `AsterExpensesView.tsx`, route `[shopSlug]/expenses`. Model: `Expense` (`shopId`, `name`, `amount`, `createdById` → `ShopAdmin`, `createdAt`).

- `GET /` — optional `from`/`to` date-range query params (inclusive, `to` extended to end-of-day); returns `{rows, total}` where `total` is a DB-side `Sum(amount)` aggregate over the same filtered set, not a client-side sum of `rows`.
- `POST /` — `{name, amount}`; `amount` must be a positive number, `name` non-blank (trimmed).
- `DELETE /:id` — scoped to the shop (404 if the id belongs to another shop).
- Frontend has Daily/Weekly/Monthly/Yearly preset buttons (client-side date-range math, same "presets are just from/to" pattern as Dashboard's own date filter) plus manual From/To date inputs; an Add-Expense row (Name + Price inputs, a "+ Add" button, Enter-to-submit on either input) that posts and reloads the list; a table with a Total footer row. Reachable only via the Dashboard's button row (see Dashboard above), not the MENU dropdown.

---

## CSV Import

**Backend only** (`csvImportRoutes.ts` CSV IMPORT section) — no dedicated frontend view found wired to these; may be an ops-only/legacy import path predating the superadmin catalog-clone mechanism.

- `POST /products/import` — CSV → upserts `Department`/`SubDepartment`/`Supplier`, creates `Product` rows. Sequential per-row awaits, no transaction batching.
- `POST /batches/import` — CSV → resolves `Store`/`Product`, creates `Batch` rows; skips and collects an error string for unresolvable rows.

**Gap**: neither route is behind a `requirePermission(...)` gate (unlike almost every other route in the file) — only the blanket `router.use(requireShopAdmin)`, so any authenticated shop account can hit these regardless of granted permissions.

---

## Superadmin / Platform level

**Backend**: `superadminRoutes.ts`, `authRoutes.ts`, `auth.ts`. **Frontend**: `frontend/src/app/superadmin/page.tsx`, `frontend/src/lib/menuFeatures.ts`.

- `POST /superadmin/login`, `POST /shop/:slug/login` — the two login endpoints (see Auth in Architecture above).
- `GET /shops` — list with counts + sales aggregate; **self-heals** shops stuck with `productCount===0` by re-firing `triggerCatalogClone` (handles a serverless function freezing mid-clone).
- `GET /stats` — platform-wide totals, optional date range.
- `POST /shops` (multipart, logo upload) — provisions a shop: unique `code`/`slug` check, creates `Shop` + one `ADMIN` `ShopAdmin` + one `STAFF` `ShopAdmin` + `ShopSetting` + `CustomerCounter` + a "Main Store" (`MAIN01`) + its `InvoiceCounter`, all in one transaction, then fires `triggerCatalogClone` **unawaited** (clones ~17k product/batch rows from a template shop — not blocking the response to avoid a serverless timeout).
- `PATCH /shops/:id/status` — toggles `ACTIVE`/`SUSPENDED`.
- `PUT /shops/:id` — edits shop + admin/staff accounts; blank username/password fields mean "keep existing."
- `DELETE /shops/:id` — manual cascading delete in dependency order.

**Gap**: the delete sequence predates this session's newer modules (GRN, VST, RTV, AdjOthers, PurchaseRequisition, Employee, SaleItemCancellation) and does not clean those tables up — deleting a shop with any of this session's data would likely hit an FK `RESTRICT` error or leave orphaned rows. Needs a follow-up fix before it's safe to use on a shop that has used the newer features.

`menuFeatures.ts`'s `MENU_FEATURE_COLUMNS` is the single source of truth for both the shop nav's dropdown grouping and the superadmin's permission checklist. `DEFAULT_ADMIN_PERMISSIONS` = all feature ids; `DEFAULT_STAFF_PERMISSIONS` = `["billing","customer-registration","stock-data"]`. Note: `internal-issue`, `internal-receive`, `internal-requisition`, `req-central-warehouse` are permission placeholders in this list with **no corresponding backend routes anywhere** — menu items without an implemented module yet.

---

## Known follow-ups (intentionally not done)

**Phase 2 — Redux migration** (done): `ShopSessionContext` (token, shop info, stores, permissions) now runs on Redux Toolkit under the hood, same exports/shape, zero consumer changes (see State management above). Per-view local state (filters, form drafts) intentionally stayed as local `useState`, not moved to Redux.

**Phase 3 — Frontend + backend file splitting (done)**: the 10 large `Aster*View.tsx` components, `app/superadmin/page.tsx`, `types/index.ts`, and `services/api.ts` have all been split into folders/domain files (see Architecture above) — pure code motion, no logic or UI changes, verified by a clean `tsc`/`next build` and an unchanged route list. `backend/src/routes/shopRoutes.ts` (was 2470 lines) has now also been split into `stockDataRoutes.ts`/`billingRoutes.ts`/`customerRoutes.ts`/`dashboardRoutes.ts`/`salesReportRoutes.ts`/`csvImportRoutes.ts` + a slimmed-down `shopRoutes.ts` (see Route files above), verified byte-identical against the original and clean `tsc`/`npm run build`. **Still not done**: the organic route-file cross-export helper sharing (see Architecture) has not been moved into a proper `lib/`/`services/` layer on the backend.

**Deferred N+1 query patterns** (found and evaluated, deliberately left alone under the "zero logic change" constraint): the per-item `tx.batch.upsert`/`tx.batch.findFirst` loops in GRN/GRN-Without-PO/Adjust-With-PO approval flows (item counts are small in practice, and Prisma has no native bulk-upsert — a raw-SQL rewrite risks subtly different conflict semantics); the RTV-balance N+1 in the Adjust-With-PO/Adjustment-With-Others RTV-option pickers (shared helper, low request volume); Billing's sale-creation transaction (`billingRoutes.ts`) does one `tx.batch.findFirst` + `tx.batch.update` per invoice line rather than a single batched read — investigated for this session's perf pass but explicitly **not** batched: the per-line sequential update-then-read is what correctly handles the same `batchId` appearing twice in one sale (second occurrence sees the already-decremented stock); a naive upfront `findMany` would use a stale pre-decrement snapshot for both occurrences and risk silently overselling stock. Fixing any of these safely would require actual logic changes, not just query batching.

**Feature gaps found while documenting** (not caused by this session's refactor, pre-existing):
- Sales Report's `PHARMACY_CANCEL_SUMMARY`/`PHARMACY_CANCEL_DETAILS` are stubbed empty and never read `SaleItemCancellation`, despite Invoice Item Cancel now populating it. Same for the cancel/refund columns (`current/previousCancel`, `*CogsCancel`, `*VatCancel`, `*Refund`) on every other Sales Report variant — all hardcoded `0`.
- CSV import routes (`/products/import`, `/batches/import`) have no `requirePermission` gate.
- Superadmin's `DELETE /shops/:id` doesn't clean up rows in the newer modules (GRN/VST/RTV/AdjOthers/PurchaseRequisition/Employee/SaleItemCancellation) — risk of FK errors or orphaned data.
- `AsterEmployeeSalaryView.tsx` and `AsterPharmacyDashboardView.tsx` have their own locally-defined `fmt` with slightly different behavior (no `maximumFractionDigits`) than the shared `lib/format.ts` — intentionally left unmerged since unifying them would change their number output for values with more decimal places.
- Two different "combobox" components share similar names/purpose but are NOT interchangeable: `components/admin/SearchableSelect.tsx` (older, text-input based, used by Stock Data/Expire Products) vs. `components/admin/ComboSelect.tsx` (newer, button+dropdown-panel, used by the GRN/VST/RTV/Adjust/PO family). `AsterPurchaseRequisitionView/SearchableSelect.tsx` also keeps its own richer local combobox (keyboard arrow-nav, `onEnterSelect`) rather than using either shared one — only its `ComboOption` type was deduplicated.
- `statusLabel`-style status-to-text mapper functions are duplicated across ~6 files (GRN/VST/RTV/Adjust status enums) and intentionally left unmerged — each enum's states/wording differ enough that unifying risked a wrong label appearing somewhere.
- `AsterBillingView`'s item-search dropdown and `TypeaheadInput` still don't reuse the shared `ComboSelect`/`ItemEntryTypeahead` components (predates them) — left as-is in Phase 3 since unifying would be a behavior change, not just a file move.
- `services/shopApi/*.ts` still repeats the same `URLSearchParams`-building and blob-download boilerplate in nearly every method (seen 6× in the original `api.ts`) — not deduplicated in Phase 3 since that would be a code simplification beyond "move code," not just a file split.

**Feature gaps found this session (still open)**:
- `/reports/sales/export` (Excel) has no branch for `USER_WISE_COLL_SUMMARY`, `*_DUE_DETAILS`, or the 6 new `PROFIT_*` reports — it always exports the flat ledger-base shape regardless of `reportName`. Only the on-screen tables are correct for those report types today.
- Purchase Order's PDF export has a 3-column Prepared/Reviewed/Approved-By signature row with no image yet — actual signature images are a planned superadmin-uploads-per-shop-via-Cloudinary feature, not built this session; the print template has the right layout slots ready for it.
- The `isPharmaCategory()` heuristic used for the Non-Pharma department fix (see Stock Data above) may have mis-classified `FREEZING OTHERS`, `SPORTS PHARMACY`, `SURGICAL & MEDICAL DEVICES`, or `UNCATEGORIZED` (all landed in Non-Pharma by default, since none carry the `G-NN-(NN)`/`(NN)` coding the rest of the split relies on).
- `PHARMACY_CANCEL_SUMMARY`/`PHARMACY_CANCEL_DETAILS` are still stubbed (unchanged from before this session) — the new Pharmacy Sales Report (Profit) reports and `USER_WISE_COLL_SUMMARY`'s Refund column now read real cancellation/refund data, but these two specific report types were not part of this pass.
