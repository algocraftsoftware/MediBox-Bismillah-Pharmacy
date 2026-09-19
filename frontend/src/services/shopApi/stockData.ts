import { StockDataResponse } from "../../types";
import { API_BASE_URL, ApiError, request } from "./http";

export function stockDataApi(base: string, token: string) {
  return {
    getDosageForms: () => request<string[]>(`${base}/products/dosage-forms`, token),
    getGenerics: () => request<string[]>(`${base}/products/generics`, token),
    getStockSearchSuggestions: (q: string) =>
      request<{ id: number; name: string; externalCode: string | null; genericName: string }[]>(
        `${base}/products/stock-search-suggest?q=${encodeURIComponent(q)}`,
        token
      ),
    getStockData: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<StockDataResponse>(`${base}/stock-data?${qs.toString()}`, token);
    },
    exportStockData: async (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      const res = await fetch(`${API_BASE_URL}${base}/stock-data/export?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new ApiError(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stock-data.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    },
  };
}
