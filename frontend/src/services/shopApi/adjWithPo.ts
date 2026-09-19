import { AdjWithPo, AdjWithPoListResponse, PurchaseOrderOption, RtvAdjustOption } from "../../types";
import { API_BASE_URL, ApiError, request } from "./http";

export function adjWithPoApi(base: string, token: string) {
  return {
    getAdjWithPoPurchaseOrders: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<PurchaseOrderOption[]>(`${base}/adj-with-po/purchase-orders?${qs.toString()}`, token);
    },
    getAdjWithPoOrderItems: (poId: number, storeId: number) =>
      request<any[]>(`${base}/adj-with-po/purchase-orders/${poId}/items?storeId=${storeId}`, token),
    getAdjWithPoRtvOptions: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<RtvAdjustOption[]>(`${base}/adj-with-po/rtv-options?${qs.toString()}`, token);
    },
    listAdjWithPo: (params: Record<string, string | number | undefined>) => {
      const qs = new URLSearchParams();
      Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
      return request<AdjWithPoListResponse>(`${base}/adj-with-po?${qs.toString()}`, token);
    },
    getAdjWithPo: (id: number) => request<AdjWithPo>(`${base}/adj-with-po/${id}`, token),
    createAdjWithPo: (data: Record<string, unknown>) =>
      request<AdjWithPo>(`${base}/adj-with-po`, token, { method: "POST", body: JSON.stringify(data) }),
    updateAdjWithPo: (id: number, data: Record<string, unknown>) =>
      request<AdjWithPo>(`${base}/adj-with-po/${id}`, token, { method: "PUT", body: JSON.stringify(data) }),
    approveAdjWithPo: (id: number) => request<AdjWithPo>(`${base}/adj-with-po/${id}/approve`, token, { method: "POST" }),
    unapproveAdjWithPo: (id: number) => request<AdjWithPo>(`${base}/adj-with-po/${id}/unapprove`, token, { method: "POST" }),
    uploadAdjWithPoAttachment: async (id: number, file: File) => {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`${API_BASE_URL}${base}/adj-with-po/${id}/attachment`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new ApiError(detail?.error || `Upload failed (${res.status})`);
      }
      return (await res.json()) as AdjWithPo;
    },
  };
}
