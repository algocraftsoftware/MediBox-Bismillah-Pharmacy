import { ExpireProductsResponse } from "../../types";
import { API_BASE_URL, ApiError, request } from "./http";

export function expireProductsApi(base: string, token: string) {
  return {
    getExpireProducts: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<ExpireProductsResponse>(`${base}/expire-products?${qs.toString()}`, token);
    },
    exportExpireProducts: async (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      const res = await fetch(`${API_BASE_URL}${base}/expire-products/export?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new ApiError(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "expire-products.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    },
  };
}
