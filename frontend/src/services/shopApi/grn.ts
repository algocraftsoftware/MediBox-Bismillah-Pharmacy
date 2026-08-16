import { Grn, GrnListResponse, GrnPoPreviewItem, PurchaseOrderOption } from "../../types";
import { request } from "./http";

export function grnApi(base: string, token: string) {
  return {
    getGrnPurchaseOrders: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<PurchaseOrderOption[]>(`${base}/grn/purchase-orders?${qs.toString()}`, token);
    },
    getGrnPurchaseOrderItems: (poId: number, storeId: number) =>
      request<GrnPoPreviewItem[]>(`${base}/grn/purchase-orders/${poId}/items?storeId=${storeId}`, token),
    listGrns: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<GrnListResponse>(`${base}/grn?${qs.toString()}`, token);
    },
    getGrn: (id: number) => request<Grn>(`${base}/grn/${id}`, token),
    createGrn: (data: Record<string, unknown>) =>
      request<Grn>(`${base}/grn`, token, { method: "POST", body: JSON.stringify(data) }),
    updateGrn: (id: number, data: Record<string, unknown>) =>
      request<Grn>(`${base}/grn/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    approveGrn: (id: number) => request<Grn>(`${base}/grn/${id}/approve`, token, { method: "POST" }),
  };
}
