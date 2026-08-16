import { BatchSearchResult, Sale } from "../../types";
import { request } from "./http";

export function billingApi(base: string, token: string) {
  return {
    searchProducts: (q: string, storeId: number) =>
      request<BatchSearchResult[]>(
        `${base}/products/search?q=${encodeURIComponent(q)}&storeId=${storeId}`,
        token
      ),
    findByBarcode: (barcode: string, storeId: number) =>
      request<BatchSearchResult>(`${base}/products/by-barcode/${encodeURIComponent(barcode)}?storeId=${storeId}`, token),

    createSale: (data: Record<string, unknown>) =>
      request<Sale>(`${base}/sales`, token, { method: "POST", body: JSON.stringify(data) }),
  };
}
