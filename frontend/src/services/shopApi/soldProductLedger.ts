import { SoldLedgerResponse } from "../../types";
import { API_BASE_URL, ApiError, request } from "./http";

export function soldProductLedgerApi(base: string, token: string) {
  return {
    searchProductNames: (q: string) =>
      request<{ id: number; name: string }[]>(`${base}/products/search-names?q=${encodeURIComponent(q)}`, token),

    getSoldProductLedger: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<SoldLedgerResponse>(`${base}/sold-product-ledger?${qs.toString()}`, token);
    },
    exportSoldProductLedger: async (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      const res = await fetch(`${API_BASE_URL}${base}/sold-product-ledger/export?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new ApiError(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "sold-product-ledger.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    },
  };
}
