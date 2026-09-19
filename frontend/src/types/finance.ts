// Financial Overview — a whole-shop ledger read over what the app already
// records (Billing, GRN, Expenses, Employee Salary). Nothing is hand-entered.
export interface FinanceTotals {
  income: number;
  cogs: number;
  purchases: number;
  expenses: number;
  salaries: number;
  grossProfit: number;
  netProfit: number;
  totalDebit: number;
  totalCredit: number;
  invoiceCount: number;
}

export interface FinanceMonthPoint {
  month: string;
  income: number;
  purchases: number;
  expenses: number;
  salaries: number;
  grossProfit: number;
  netProfit: number;
}

export interface PharmaSplit {
  pharma: number;
  nonPharma: number;
}

// What the shop actually holds and runs on, alongside the money.
export interface ShopSnapshot {
  products: number;
  customers: number;
  employees: number;
  suppliers: number;
  stores: number;
  stockOnHand: { qoh: number; skus: number; costValue: number; retailValue: number };
  // Each figure split across the two sides of the shop. Stock, quantity and SKU
  // splits add back to their totals; suppliers do not, because one supplying
  // both sides is counted on both rather than halved.
  split: {
    qoh: PharmaSplit;
    skus: PharmaSplit;
    costValue: PharmaSplit;
    retailValue: PharmaSplit;
    suppliers: PharmaSplit;
  };
}

// Who and what drove the period — each list is the top few, straight from the
// same Sale / GRN / Expense rows the totals come from.
export interface FinanceLeaders {
  topProducts: { name: string; revenue: number; qty: number }[];
  topCustomers: { name: string; revenue: number; invoices: number }[];
  topSuppliers: { name: string; value: number; grns: number }[];
  expenseBreakdown: { name: string; amount: number }[];
  paymentMix: { cash: number; card: number; mobile: number; due: number };
}

// "Right now" warnings, independent of the selected date range.
export interface ShopAlerts {
  expired: { items: number; qty: number; costValue: number };
  expiringSoon: { items: number; qty: number; costValue: number };
  lowStockCount: number;
  outOfStockCount: number;
  receivables: { outstanding: number; invoices: number };
}

export interface FinanceOverview {
  shop: { name: string; address: string | null; phone: string | null };
  period: { from: string; to: string };
  previousPeriod: { from: string; to: string };
  current: FinanceTotals;
  previous: FinanceTotals;
  growth: { income: number; netProfit: number; grossProfit: number };
  monthly: FinanceMonthPoint[];
  snapshot: ShopSnapshot;
  leaders: FinanceLeaders;
  alerts: ShopAlerts;
}

export type JournalEntryType = "Sales" | "Purchase" | "Expense" | "Salary";

export interface JournalEntry {
  id: string;
  date: string;
  transactionId: string;
  type: JournalEntryType;
  description: string;
  account: string;
  debit: number;
  credit: number;
}

export interface JournalResponse {
  rows: JournalEntry[];
  total: number;
  page: number;
  pageSize: number;
  truncated: boolean;
}
