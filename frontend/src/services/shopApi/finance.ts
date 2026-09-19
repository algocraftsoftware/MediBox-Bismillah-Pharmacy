import { FinanceOverview, JournalResponse } from "../../types";
import { request } from "./http";

const qs = (params: Readonly<Record<string, string | number | undefined>>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && search.set(k, String(v)));
  return search.toString();
};

export function financeApi(base: string, token: string) {
  return {
    getFinanceOverview: (params: { from?: string; to?: string; storeId?: string }) =>
      request<FinanceOverview>(`${base}/finance/overview?${qs({ ...params })}`, token),
    getFinanceJournal: (params: { from?: string; to?: string; storeId?: string; page?: number; pageSize?: number }) =>
      request<JournalResponse>(`${base}/finance/journal?${qs({ ...params })}`, token),
  };
}
