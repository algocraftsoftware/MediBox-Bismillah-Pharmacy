import { DepartmentStockReport, StockReportFilterValues, StockReportType, VendorStockReport } from "../../types";
import { API_BASE_URL, ApiError, request } from "./http";

const qs = (params: Readonly<Record<string, string | number | undefined>>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== "" && search.set(k, String(v)));
  return search.toString();
};

export function stockReportApi(base: string, token: string) {
  return {
    getDepartmentStockReport: (filters: StockReportFilterValues) =>
      request<DepartmentStockReport>(`${base}/stock-report/department-wise?${qs({ ...filters })}`, token),
    getVendorStockReport: (filters: StockReportFilterValues) =>
      request<VendorStockReport>(`${base}/stock-report/vendor-wise?${qs({ ...filters })}`, token),
    exportStockReport: async (reportType: StockReportType, filters: StockReportFilterValues) => {
      const res = await fetch(`${API_BASE_URL}${base}/stock-report/export?${qs({ ...filters, reportType })}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new ApiError(`Export failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportType === "VENDOR" ? "vendor-wise-stock-report.xlsx" : "department-wise-stock-report.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    },
  };
}
