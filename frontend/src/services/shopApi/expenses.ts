import { Expense, ExpenseListResponse } from "../../types";
import { request } from "./http";

export function expensesApi(base: string, token: string) {
  return {
    listExpenses: (params: { from?: string; to?: string }) => {
      const qs = new URLSearchParams();
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
      return request<ExpenseListResponse>(`${base}/expenses?${qs.toString()}`, token);
    },
    createExpense: (data: { name: string; amount: number }) =>
      request<Expense>(`${base}/expenses`, token, { method: "POST", body: JSON.stringify(data) }),
    updateExpense: (id: number, data: { name: string; amount: number }) =>
      request<Expense>(`${base}/expenses/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    deleteExpense: (id: number) => request<{ ok: boolean }>(`${base}/expenses/${id}`, token, { method: "DELETE" }),
  };
}
