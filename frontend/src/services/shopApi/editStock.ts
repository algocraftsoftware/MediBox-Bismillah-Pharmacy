import { EditStockResponse, EditStockSaveResult, EditStockUpdate } from "../../types";
import { API_BASE_URL, ApiError, request } from "./http";

export function editStockApi(base: string, token: string) {
  return {
    getEditStock: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<EditStockResponse>(`${base}/edit-stock?${qs.toString()}`, token);
    },
    // Every edited row on the page goes in one request, so a page of edits
    // either lands completely or not at all.
    saveEditStock: (storeId: number, updates: EditStockUpdate[]) =>
      request<EditStockSaveResult>(`${base}/edit-stock`, token, {
        method: "PATCH",
        body: JSON.stringify({ storeId, updates }),
      }),
    exportEditStock: async (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      const res = await fetch(`${API_BASE_URL}${base}/edit-stock/export?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new ApiError(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "edit-stock.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    },
  };
}
