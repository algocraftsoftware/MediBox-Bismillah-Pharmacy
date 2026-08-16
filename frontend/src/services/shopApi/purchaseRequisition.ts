import { PurchaseRequisition, PurchaseRequisitionListResponse, RequisitionItemsResponse } from "../../types";
import { request } from "./http";

export function purchaseRequisitionApi(base: string, token: string) {
  return {
    listRequisitions: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<PurchaseRequisitionListResponse>(`${base}/purchase-requisitions?${qs.toString()}`, token);
    },
    getRequisition: (id: number) => request<PurchaseRequisition>(`${base}/purchase-requisitions/${id}`, token),
    getRequisitionItems: (params: Record<string, string | number | boolean | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<RequisitionItemsResponse>(`${base}/purchase-requisitions/items?${qs.toString()}`, token);
    },
    createRequisition: (data: Record<string, unknown>) =>
      request<PurchaseRequisition>(`${base}/purchase-requisitions`, token, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateRequisition: (id: number, data: Record<string, unknown>) =>
      request<PurchaseRequisition>(`${base}/purchase-requisitions/${id}`, token, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    approveRequisition: (id: number) =>
      request<PurchaseRequisition>(`${base}/purchase-requisitions/${id}/approve`, token, { method: "POST" }),
  };
}
