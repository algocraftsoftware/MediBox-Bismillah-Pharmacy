import { PurchaseOrder, PurchaseOrderListResponse } from "../../types";
import { request } from "./http";

export function purchaseOrderApi(base: string, token: string) {
  return {
    listPurchaseOrders: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<PurchaseOrderListResponse>(`${base}/purchase-orders?${qs.toString()}`, token);
    },
    getPurchaseOrder: (id: number) => request<PurchaseOrder>(`${base}/purchase-orders/${id}`, token),
    updatePurchaseOrder: (id: number, data: Record<string, unknown>) =>
      request<PurchaseOrder>(`${base}/purchase-orders/${id}`, token, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    finalApprovePurchaseOrder: (id: number) =>
      request<PurchaseOrder>(`${base}/purchase-orders/${id}/final-approve`, token, { method: "POST" }),
<<<<<<< HEAD
    unapprovePurchaseOrder: (id: number) =>
      request<PurchaseOrder>(`${base}/purchase-orders/${id}/unapprove`, token, { method: "POST" }),
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
  };
}
