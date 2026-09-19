// =======================================================
// EXPENSES
// =======================================================

export interface Expense {
  id: number;
  shopId: number;
  name: string;
  amount: number;
  createdById: number;
  createdBy: { id: number; name: string; username: string; role: string };
  createdAt: string;
}

export interface ExpenseListResponse {
  rows: Expense[];
  total: number;
}
