// The shop nav's MENU dropdown items — fixed serial order (per the Super
// Admin's own numbered layout sheet), rendered 4-per-column and
// auto-flowing (see AsterHeader.tsx) so removing a permission just closes
// the gap and reflows instead of leaving a ragged fixed column short or any
// blank space. Also doubles as (part of) the master list of permission keys
// a Super Admin can grant to an Admin/Staff account — every route id here
// is a togglable feature.
export const MENU_FEATURES: { id: string; label: string }[] = [
  { id: "dashboard", label: "Pharmacy Dashboard" },
  { id: "purchase-requisition", label: "Pur.Requisition" },
  { id: "billing", label: "Billing" },
  { id: "invoice-list", label: "Invoice List" },
  { id: "customer-registration", label: "Customer Registration" },
  { id: "purchase-order", label: "Purchase Order" },
  { id: "grn-with-po", label: "GRN With PO" },
  { id: "grn-without-po", label: "GRN Without PO" },
  { id: "sales-report", label: "Sales Report" },
  { id: "invoice-item-cancel", label: "Invoice Item Cancel" },
  { id: "sold-product-ledger", label: "Sold Product Ledger" },
  { id: "stock-data", label: "Stock Data" },
  { id: "expire-products", label: "Expire Products" },
  { id: "virtual-stock-transfer", label: "Virtual Stock Transfer (VST)" },
  { id: "return-to-vendor", label: "Return To Vendor (RTV)" },
  { id: "adj-with-po", label: "ADJ. With PO" },
  { id: "adj-with-others", label: "ADJ. With Others" },
  // Not on the layout sheet — appended after the numbered items so the serial
  // order above keeps matching it. Edit Stock leads this group: it's the one
  // built feature here, and the four below it are still Coming Soon screens.
  { id: "edit-stock", label: "Edit Stock" },
  { id: "internal-issue", label: "Internal Issue" },
  { id: "internal-receive", label: "Internal Receive" },
  { id: "internal-requisition", label: "Internal Requisition" },
  { id: "req-central-warehouse", label: "Req. To Central Warehouse" },
];

// Not shown in the MENU dropdown — these render as buttons on the Pharmacy
// Dashboard page itself, below its header, in this order. Still real
// permission keys (grantable/gated exactly like MENU_FEATURES) and still
// real routes, they just aren't part of the main menu grid.
export const DASHBOARD_FEATURES: { id: string; label: string }[] = [
  { id: "employees", label: "Employees" },
  { id: "employee-salary", label: "Employee Salary" },
  { id: "expenses", label: "Expenses" },
];

export const ALL_FEATURES: { id: string; label: string }[] = [...MENU_FEATURES, ...DASHBOARD_FEATURES];
export const ALL_FEATURE_IDS: string[] = ALL_FEATURES.map((f) => f.id);

// Sensible defaults for a brand-new account so the form isn't fully blank —
// still fully overridable via the checklist before submitting.
export const DEFAULT_ADMIN_PERMISSIONS: string[] = ALL_FEATURE_IDS;
export const DEFAULT_STAFF_PERMISSIONS: string[] = ["billing", "customer-registration", "stock-data"];
