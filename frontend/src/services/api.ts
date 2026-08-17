import {
  PlatformStats,
  Sale,
  ShopAdminAccount,
  ShopAdminSession,
  ShopSummary,
  Store,
  SuperAdminSession,
} from "../types";
import { ApiError, request } from "./shopApi/http";
import { adjOthersApi } from "./shopApi/adjOthers";
import { adjWithPoApi } from "./shopApi/adjWithPo";
import { billingApi } from "./shopApi/billing";
import { coreApi } from "./shopApi/core";
import { createStockApi } from "./shopApi/createStock";
import { customerApi } from "./shopApi/customer";
import { dashboardApi } from "./shopApi/dashboard";
import { editStockApi } from "./shopApi/editStock";
import { employeesApi } from "./shopApi/employees";
import { expensesApi } from "./shopApi/expenses";
import { expireProductsApi } from "./shopApi/expireProducts";
import { grnApi } from "./shopApi/grn";
import { grnWithoutPoApi } from "./shopApi/grnWithoutPo";
import { purchaseOrderApi } from "./shopApi/purchaseOrder";
import { purchaseRequisitionApi } from "./shopApi/purchaseRequisition";
import { rtvApi } from "./shopApi/rtv";
import { salesApi } from "./shopApi/sales";
import { salesReportApi } from "./shopApi/salesReport";
import { soldProductLedgerApi } from "./shopApi/soldProductLedger";
import { stockDataApi } from "./shopApi/stockData";
import { vstApi } from "./shopApi/vst";

export { ApiError };

// =======================================================
// SESSION STORAGE (localStorage; internal ERP tool, not a
// public consumer app, so a Bearer token is acceptable here)
// =======================================================

const SUPERADMIN_KEY = "medibox.superadmin.session";
const SHOPADMIN_KEY = "medibox.shopadmin.session";

export const session = {
  getSuperAdmin(): SuperAdminSession | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(SUPERADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setSuperAdmin(s: SuperAdminSession) {
    window.localStorage.setItem(SUPERADMIN_KEY, JSON.stringify(s));
  },
  clearSuperAdmin() {
    window.localStorage.removeItem(SUPERADMIN_KEY);
  },
  getShopAdmin(): ShopAdminSession | null {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(SHOPADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setShopAdmin(s: ShopAdminSession) {
    window.localStorage.setItem(SHOPADMIN_KEY, JSON.stringify(s));
  },
  clearShopAdmin() {
    window.localStorage.removeItem(SHOPADMIN_KEY);
  },
};

// =======================================================
// AUTH
// =======================================================

export const authApi = {
  superAdminLogin: (email: string, password: string) =>
    request<SuperAdminSession>("/auth/superadmin/login", null, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  shopAdminLogin: (slug: string, username: string, password: string) =>
    request<ShopAdminSession>(`/auth/shop/${slug}/login`, null, {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
};

// =======================================================
// SUPER ADMIN API
// =======================================================

export const superAdminApi = {
  listShops: (token: string) => request<ShopSummary[]>("/superadmin/shops", token),
  getPlatformStats: (token: string, params?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from) qs.set("from", params.from);
    if (params?.to) qs.set("to", params.to);
    const qsStr = qs.toString();
    return request<PlatformStats>(`/superadmin/stats${qsStr ? "?" + qsStr : ""}`, token);
  },
  createShop: (
    token: string,
    data: {
      code: string;
      name: string;
      slug: string;
      adminName: string;
      adminUsername: string;
      adminPassword: string;
      adminPermissions: string[];
      staffName: string;
      staffUsername: string;
      staffPassword: string;
      staffPermissions: string[];
      address?: string;
      phone?: string;
      logo?: File | null;
      signaturePreparedBy?: File | null;
      signatureReviewedBy?: File | null;
      signatureApprovedBy?: File | null;
    }
  ) => {
    const form = new FormData();
    form.append("code", data.code);
    form.append("name", data.name);
    form.append("slug", data.slug);
    form.append("adminName", data.adminName);
    form.append("adminUsername", data.adminUsername);
    form.append("adminPassword", data.adminPassword);
    form.append("adminPermissions", JSON.stringify(data.adminPermissions));
    form.append("staffName", data.staffName);
    form.append("staffUsername", data.staffUsername);
    form.append("staffPassword", data.staffPassword);
    form.append("staffPermissions", JSON.stringify(data.staffPermissions));
    if (data.address) form.append("address", data.address);
    if (data.phone) form.append("phone", data.phone);
    if (data.logo) form.append("logo", data.logo);
    if (data.signaturePreparedBy) form.append("signaturePreparedBy", data.signaturePreparedBy);
    if (data.signatureReviewedBy) form.append("signatureReviewedBy", data.signatureReviewedBy);
    if (data.signatureApprovedBy) form.append("signatureApprovedBy", data.signatureApprovedBy);
    return request<ShopSummary>("/superadmin/shops", token, {
      method: "POST",
      body: form,
    });
  },
  toggleShopStatus: (token: string, id: number) =>
    request<ShopSummary>(`/superadmin/shops/${id}/status`, token, { method: "PATCH" }),
  getShop: (token: string, id: number) =>
    request<{
      id: number;
      code: string;
      name: string;
      slug: string;
      logoUrl: string | null;
      preparedBySignatureUrl: string | null;
      reviewedBySignatureUrl: string | null;
      approvedBySignatureUrl: string | null;
      address: string | null;
      phone: string | null;
      status: "ACTIVE" | "SUSPENDED";
      admins: ShopAdminAccount[];
      stores: Store[];
    }>(`/superadmin/shops/${id}`, token),
  updateShop: (
    token: string,
    id: number,
    data: {
      code: string;
      name: string;
      slug: string;
      status: "ACTIVE" | "SUSPENDED";
      adminName?: string;
      adminUsername?: string;
      adminPassword?: string;
      adminPermissions?: string[];
      address?: string;
      phone?: string;
      logo?: File | null;
      signaturePreparedBy?: File | null;
      signatureReviewedBy?: File | null;
      signatureApprovedBy?: File | null;
    }
  ) => {
    const form = new FormData();
    form.append("code", data.code);
    form.append("name", data.name);
    form.append("slug", data.slug);
    form.append("status", data.status);
    if (data.address !== undefined) form.append("address", data.address);
    if (data.phone !== undefined) form.append("phone", data.phone);
    if (data.adminName) form.append("adminName", data.adminName);
    if (data.adminUsername) form.append("adminUsername", data.adminUsername);
    if (data.adminPassword) form.append("adminPassword", data.adminPassword);
    if (data.adminPermissions) form.append("adminPermissions", JSON.stringify(data.adminPermissions));
    if (data.logo) form.append("logo", data.logo);
    if (data.signaturePreparedBy) form.append("signaturePreparedBy", data.signaturePreparedBy);
    if (data.signatureReviewedBy) form.append("signatureReviewedBy", data.signatureReviewedBy);
    if (data.signatureApprovedBy) form.append("signatureApprovedBy", data.signatureApprovedBy);
    return request<ShopSummary>(`/superadmin/shops/${id}`, token, { method: "PUT", body: form });
  },
  deleteShop: (token: string, id: number) =>
    request<{ ok: boolean }>(`/superadmin/shops/${id}`, token, { method: "DELETE" }),
  addShopBranch: (token: string, id: number, data: { name: string; address?: string; phone?: string }) =>
    request<Store>(`/superadmin/shops/${id}/stores`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  createStaff: (
    token: string,
    shopId: number,
    data: { name: string; username: string; password: string; permissions: string[] }
  ) =>
    request<ShopAdminAccount>(`/superadmin/shops/${shopId}/staff`, token, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateStaff: (
    token: string,
    shopId: number,
    staffId: number,
    data: { name?: string; username?: string; password?: string; permissions?: string[] }
  ) =>
    request<ShopAdminAccount>(`/superadmin/shops/${shopId}/staff/${staffId}`, token, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  toggleStaffStatus: (token: string, shopId: number, staffId: number) =>
    request<ShopAdminAccount>(`/superadmin/shops/${shopId}/staff/${staffId}/status`, token, { method: "PATCH" }),
  shopSalesSummary: (token: string, id: number, from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return request<{ totalSales: number; totalDue: number; totalOrders: number; totalProfit: number; recentSales: Sale[] }>(
      `/superadmin/shops/${id}/sales-summary?${qs.toString()}`,
      token
    );
  },
};

// =======================================================
// SHOP-SCOPED API
//
// Composed from per-domain modules in ./shopApi/*, each a
// factory `(base, token) => ({ ...methods })` closing only
// over the shop's base URL and auth token. Merged into one
// flat object here so every call site keeps working exactly
// as before: `const api = shopApi(slug, token); api.foo()`.
// =======================================================

export function shopApi(slug: string, token: string) {
  const base = `/shops/${slug}`;
  return {
    ...coreApi(base, token),
    ...stockDataApi(base, token),
    ...editStockApi(base, token),
    ...createStockApi(base, token),
    ...expireProductsApi(base, token),
    ...soldProductLedgerApi(base, token),
    ...customerApi(base, token),
    ...billingApi(base, token),
    ...salesApi(base, token),
    ...dashboardApi(base, token),
    ...employeesApi(base, token),
    ...expensesApi(base, token),
    ...salesReportApi(base, token),
    ...purchaseRequisitionApi(base, token),
    ...purchaseOrderApi(base, token),
    ...grnApi(base, token),
    ...grnWithoutPoApi(base, token),
    ...vstApi(base, token),
    ...rtvApi(base, token),
    ...adjWithPoApi(base, token),
    ...adjOthersApi(base, token),
  };
}
