"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Download, FileBarChart, Printer } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../services/api";
import { Spinner } from "../../components/Spinner";
import {
  DepartmentStockReport,
  StockReportFilterValues,
  StockReportTotals,
  StockReportType,
  VendorStockReport,
} from "../../types";
import { fmt } from "../../lib/format";
import { SearchableSelect } from "./SearchableSelect";
import { ReportOverlay } from "./ReportOverlay";
import { useDepartments, useSuppliers } from "../../hooks/useShopLookups";

const REPORT_TYPES: { value: StockReportType; label: string }[] = [
  { value: "DEPARTMENT", label: "Department Wise Stock Report" },
  { value: "VENDOR", label: "Vendor Wise Stock Report" },
];

const pct = (n: number) => `${n.toFixed(2)}%`;
const int = (n: number) => n.toLocaleString();

// The six money/count cells every row shares — a department row, an outlet
// Total and the Grand Total all render through this, so they cannot format
// differently. Module scope, not inside the view, so React sees one stable
// component type across renders.
const TotalCells: React.FC<{ t: StockReportTotals }> = ({ t }) => (
  <>
    <td className="py-2.5 px-3 border border-slate-300 text-right">{int(t.skuCount)}</td>
    <td className="py-2.5 px-3 border border-slate-300 text-right">{int(t.qoh)}</td>
    <td className="py-2.5 px-3 border border-slate-300 text-right">{fmt(t.cogs)}</td>
    <td className="py-2.5 px-3 border border-slate-300 text-right">{fmt(t.salesValue)}</td>
    <td className="py-2.5 px-3 border border-slate-300 text-right">{fmt(t.profit)}</td>
    <td className="py-2.5 px-3 border border-slate-300 text-right">{pct(t.profitPct)}</td>
  </>
);

export const MediboxStockReportView: React.FC = () => {
  const { shopSlug, token, stores, shopName, shopAddress, shopPhone, logoUrl } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [reportType, setReportType] = useState<StockReportType>("DEPARTMENT");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [storeId, setStoreId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [subDepartmentId, setSubDepartmentId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [generic, setGeneric] = useState("");
  const [dosageForm, setDosageForm] = useState("");
  const [productId, setProductId] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [itemOptions, setItemOptions] = useState<{ id: number; name: string; externalCode: string | null }[]>([]);

  const departments = useDepartments(api);
  const suppliers = useSuppliers(api);
  const [dosageForms, setDosageForms] = useState<string[]>([]);
  const [generics, setGenerics] = useState<string[]>([]);

  const [deptReport, setDeptReport] = useState<DepartmentStockReport | null>(null);
  const [vendorReport, setVendorReport] = useState<VendorStockReport | null>(null);
  const [shownType, setShownType] = useState<StockReportType>("DEPARTMENT");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportHtml, setReportHtml] = useState<string | null>(null);

  useEffect(() => {
    api.getDosageForms().then(setDosageForms).catch(() => {});
    api.getGenerics().then(setGenerics).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Item is query-driven rather than preloaded — product names are not a small
  // deduplicated list like departments or dosage forms.
  useEffect(() => {
    const q = itemQuery.trim();
    const t = setTimeout(() => {
      if (q.length < 2) {
        setItemOptions([]);
        return;
      }
      api
        .getStockSearchSuggestions(q)
        .then(setItemOptions)
        .catch(() => setItemOptions([]));
    }, 250);
    return () => clearTimeout(t);
  }, [api, itemQuery]);

  const subDepartments = departments.find((d) => String(d.id) === departmentId)?.subDepartments ?? [];

  const filters: StockReportFilterValues = {
    from: from || undefined,
    to: to || undefined,
    storeId: storeId || undefined,
    departmentId: departmentId || undefined,
    subDepartmentId: subDepartmentId || undefined,
    supplierId: supplierId || undefined,
    generic: generic || undefined,
    dosageForm: dosageForm || undefined,
    productId: productId || undefined,
  };

  const handleShowReport = () => {
    setLoading(true);
    setError(null);
    const wanted = reportType;
    const run =
      wanted === "VENDOR"
        ? api.getVendorStockReport(filters).then((r) => {
            setVendorReport(r);
            setDeptReport(null);
          })
        : api.getDepartmentStockReport(filters).then((r) => {
            setDeptReport(r);
            setVendorReport(null);
          });
    run
      .then(() => setShownType(wanted))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not build the report"))
      .finally(() => setLoading(false));
  };

  const handleClear = () => {
    setFrom("");
    setTo("");
    setStoreId("");
    setDepartmentId("");
    setSubDepartmentId("");
    setSupplierId("");
    setGeneric("");
    setDosageForm("");
    setProductId("");
    setItemQuery("");
    setDeptReport(null);
    setVendorReport(null);
    setError(null);
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      await api.exportStockReport(shownType, filters);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const hasReport = Boolean(deptReport || vendorReport);
  const reportTitle = REPORT_TYPES.find((r) => r.value === shownType)?.label ?? "";
  // Matches the backend's own row labelling: the shop is what the report is
  // "for", with the branch named only when the shop actually has more than one.
  const selectedStoreName = storeId ? stores.find((s) => String(s.id) === storeId)?.name ?? "" : "";
  const storeLabel =
    stores.length > 1 && selectedStoreName ? `${shopName} (${selectedStoreName})` : shopName || "All Stores";

  // The printed sheet mirrors the on-screen table exactly, with the shop's own
  // details (set by the Super Admin) as the letterhead.
  const handlePrint = () => {
    const head = `
      <div class="letterhead">
        ${logoUrl ? `<img src="${logoUrl}" alt="" />` : ""}
        <div>
          <h1>${shopName || ""}</h1>
          ${shopAddress ? `<div class="addr">${shopAddress}</div>` : ""}
          ${shopPhone ? `<div class="addr">Phone: ${shopPhone}</div>` : ""}
        </div>
      </div>
      <div class="doc-title">${storeLabel} — ${reportTitle.toUpperCase()}</div>`;

    let body = "";
    if (shownType === "VENDOR" && vendorReport) {
      body = `<table><thead><tr>
          <th>Sl</th><th>Store Name</th><th>Vendor Name</th>
          <th class="right">Current Stock</th><th class="right">Total Sales Value</th><th class="right">Total Cost Value</th>
        </tr></thead><tbody>
        ${vendorReport.rows
          .map(
            (r, i) => `<tr><td>${i + 1}</td><td>${r.storeName}</td><td>${r.vendorName}</td>
              <td class="right">${int(r.qoh)}</td><td class="right">${fmt(r.salesValue)}</td><td class="right">${fmt(r.cogs)}</td></tr>`,
          )
          .join("")}
        <tr class="grand"><td></td><td></td><td>Grand Total</td>
          <td class="right">${int(vendorReport.grandTotal.qoh)}</td>
          <td class="right">${fmt(vendorReport.grandTotal.salesValue)}</td>
          <td class="right">${fmt(vendorReport.grandTotal.cogs)}</td></tr>
        </tbody></table>`;
    } else if (deptReport) {
      const rowsHtml = deptReport.outlets
        .map((outlet, oi) => {
          const inner = outlet.rows
            .map(
              (r, i) => `<tr>
                ${i === 0 ? `<td rowspan="${outlet.rows.length}">${oi + 1}</td><td rowspan="${outlet.rows.length}">${r.outletName}</td>` : ""}
                <td>${r.departmentName}</td>
                <td class="right">${int(r.skuCount)}</td><td class="right">${int(r.qoh)}</td>
                <td class="right">${fmt(r.cogs)}</td><td class="right">${fmt(r.salesValue)}</td>
                <td class="right">${fmt(r.profit)}</td><td class="right">${pct(r.profitPct)}</td></tr>`,
            )
            .join("");
          const total = `<tr class="total"><td colspan="2"></td><td>Total</td>
            <td class="right">${int(outlet.total.skuCount)}</td><td class="right">${int(outlet.total.qoh)}</td>
            <td class="right">${fmt(outlet.total.cogs)}</td><td class="right">${fmt(outlet.total.salesValue)}</td>
            <td class="right">${fmt(outlet.total.profit)}</td><td class="right">${pct(outlet.total.profitPct)}</td></tr>`;
          return inner + total;
        })
        .join("");
      body = `<table><thead><tr>
          <th>SL</th><th>Outlet Name</th><th>Department Name</th><th class="right">SKU No</th>
          <th class="right">QOH</th><th class="right">COGS</th><th class="right">Sales Value</th>
          <th class="right">Profit (TK)</th><th class="right">Profit (%)</th>
        </tr></thead><tbody>${rowsHtml}
        <tr class="grand"><td colspan="2"></td><td>Grand Total</td>
          <td class="right">${int(deptReport.grandTotal.skuCount)}</td><td class="right">${int(deptReport.grandTotal.qoh)}</td>
          <td class="right">${fmt(deptReport.grandTotal.cogs)}</td><td class="right">${fmt(deptReport.grandTotal.salesValue)}</td>
          <td class="right">${fmt(deptReport.grandTotal.profit)}</td><td class="right">${pct(deptReport.grandTotal.profitPct)}</td></tr>
        </tbody></table>`;
    }

    setReportHtml(`<html><head><title>${reportTitle}</title><style>
      *{box-sizing:border-box}
      body{font-family:Arial,Helvetica,sans-serif;padding:24px;color:#111;font-size:12px}
      .letterhead{display:flex;align-items:center;gap:12px;border-bottom:2px solid #111;padding-bottom:8px}
      .letterhead img{height:46px}
      h1{font-size:18px;margin:0}
      .addr{font-size:11px;color:#444}
      .doc-title{font-weight:bold;font-style:italic;margin:10px 0 12px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #999;padding:5px 7px;font-size:11px;text-align:left}
      th{background:#eef2f7;text-transform:uppercase;font-size:10px}
      .right{text-align:right}
      tr.total td,tr.grand td{font-weight:bold;background:#f6f8fa}
      tr.grand td{border-top:2px solid #111}
    </style></head><body>${head}${body}</body></html>`);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.25rem)] bg-[#f8fafc] overflow-hidden">
      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm text-xs shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 items-end mb-2.5">
          <div>
            <label className="font-bold text-slate-700 block mb-1">From Date</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">To Date</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <SearchableSelect
            label="Store Name"
            value={storeId}
            onChange={setStoreId}
            placeholder="All Stores"
            options={stores.map((s) => ({ value: String(s.id), label: s.name }))}
          />
          <SearchableSelect
            label="Report Name"
            value={reportType}
            onChange={(v) => setReportType(v as StockReportType)}
            placeholder="Select..."
            options={REPORT_TYPES.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 items-end mb-2.5">
          <SearchableSelect
            label="Department"
            value={departmentId}
            onChange={(v) => {
              setDepartmentId(v);
              setSubDepartmentId("");
            }}
            placeholder="All"
            options={departments.map((d) => ({ value: String(d.id), label: d.name }))}
          />
          <SearchableSelect
            label="Sub-Department"
            value={subDepartmentId}
            onChange={setSubDepartmentId}
            placeholder={departmentId ? "All" : "Pick a Department first"}
            options={subDepartments.map((s) => ({ value: String(s.id), label: s.name }))}
          />
          <SearchableSelect
            label="Vendor Name"
            value={supplierId}
            onChange={setSupplierId}
            placeholder="All"
            options={suppliers.map((s) => ({ value: String(s.id), label: s.name }))}
          />
          <SearchableSelect
            label="Generic Name"
            value={generic}
            onChange={setGeneric}
            placeholder="All"
            allowFreeText
            options={generics.map((g) => ({ value: g, label: g }))}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 items-end">
          <SearchableSelect
            label="Dosage Form"
            value={dosageForm}
            onChange={setDosageForm}
            placeholder="All"
            options={dosageForms.map((d) => ({ value: d, label: d }))}
          />
          <div>
            <label className="font-bold text-slate-700 block mb-1">Item</label>
            <input
              value={itemQuery}
              onChange={(e) => {
                setItemQuery(e.target.value);
                const match = itemOptions.find((o) => o.name === e.target.value);
                setProductId(match ? String(match.id) : "");
              }}
              list="stock-report-items"
              placeholder="All items — type to search..."
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
            <datalist id="stock-report-items">
              {itemOptions.map((o) => (
                <option key={o.id} value={o.name}>
                  {o.externalCode || ""}
                </option>
              ))}
            </datalist>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleShowReport}
              disabled={loading}
              className="flex-1 bg-[#dc2626] hover:bg-red-700 disabled:opacity-50 text-white font-bold py-1.5 rounded flex items-center justify-center gap-1.5"
            >
              {loading ? <Spinner size="xs" variant="white" /> : <FileBarChart className="w-3.5 h-3.5" />}
              SHOW REPORT
            </button>
            <button
              onClick={handleClear}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-1.5 rounded"
            >
              CLEAR
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={!hasReport || exporting}
              title="Download as Excel"
              className="flex-1 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white font-bold py-1.5 rounded flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Excel
            </button>
            <button
              onClick={handlePrint}
              disabled={!hasReport}
              title="Print"
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold py-1.5 rounded flex items-center justify-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          </div>
        </div>

        <p className="text-[11px] font-semibold text-slate-500 mt-2">
          Stock figures are what is on hand right now. From/To Date are optional — set them to limit the report to stock
          received in that window.
        </p>
        {error && <p className="text-red-600 font-bold text-xs mt-2">{error}</p>}
      </div>

      {/* ── Report sheet ────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-4 bg-slate-200/60">
        {!hasReport ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-400 font-bold">
            {loading ? (
              <>
                <Spinner size="lg" />
                Building report...
              </>
            ) : (
              <>
                <FileBarChart className="w-10 h-10 text-slate-300" />
                Choose a Report Name and click SHOW REPORT.
              </>
            )}
          </div>
        ) : (
          <div className="max-w-5xl mx-auto bg-white border border-slate-400 shadow-sm p-6">
            <div className="flex items-center gap-3 border-b-2 border-slate-900 pb-2.5">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-12 w-auto object-contain" />
              )}
              <div>
                <h1 className="text-lg font-black text-slate-900 uppercase">{shopName}</h1>
                {shopAddress && <p className="text-[11px] font-semibold text-slate-600">{shopAddress}</p>}
                {shopPhone && <p className="text-[11px] font-semibold text-slate-600">Phone: {shopPhone}</p>}
              </div>
            </div>
            <p className="text-xs font-black italic text-slate-800 my-3">
              {storeLabel} — {reportTitle.toUpperCase()}
            </p>

            {shownType === "DEPARTMENT" && deptReport && (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-200/90 text-slate-800 font-black uppercase">
                    <th className="py-2.5 px-3 border border-slate-300 text-left">SL</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-left">Outlet Name</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-left">Department Name</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">SKU No</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">QOH</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">COGS</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">Sales Value</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">Profit (TK)</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">Profit (%)</th>
                  </tr>
                </thead>
                <tbody className="font-semibold">
                  {deptReport.outlets.map((outlet, oi) => (
                    <React.Fragment key={outlet.outletName}>
                      {outlet.rows.map((r, i) => (
                        <tr key={`${outlet.outletName}-${r.departmentName}`} className="odd:bg-white even:bg-slate-50">
                          {i === 0 && (
                            <>
                              <td
                                rowSpan={outlet.rows.length}
                                className="py-2.5 px-3 border border-slate-300 text-slate-600 align-middle"
                              >
                                {oi + 1}
                              </td>
                              <td
                                rowSpan={outlet.rows.length}
                                className="py-2.5 px-3 border border-slate-300 font-bold text-slate-900 align-middle bg-rose-50/60"
                              >
                                {outlet.outletName}
                              </td>
                            </>
                          )}
                          <td className="py-2.5 px-3 border border-slate-300 text-slate-700">{r.departmentName}</td>
                          <TotalCells t={r} />
                        </tr>
                      ))}
                      <tr className="bg-slate-100 font-black text-slate-900">
                        <td className="py-2.5 px-3 border border-slate-300" colSpan={2} />
                        <td className="py-2.5 px-3 border border-slate-300 text-center">Total</td>
                        <TotalCells t={outlet.total} />
                      </tr>
                    </React.Fragment>
                  ))}
                  {deptReport.outlets.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 border border-slate-300 text-center text-slate-400 font-bold">
                        No stock found for these filters.
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-200 font-black text-slate-900 border-t-2 border-slate-900">
                    <td className="py-2.5 px-3 border border-slate-300" colSpan={2} />
                    <td className="py-2.5 px-3 border border-slate-300 text-center">Grand Total</td>
                    <TotalCells t={deptReport.grandTotal} />
                  </tr>
                </tbody>
              </table>
            )}

            {shownType === "VENDOR" && vendorReport && (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-200/90 text-slate-800 font-black uppercase">
                    <th className="py-2.5 px-3 border border-slate-300 text-left w-12">Sl</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-left">Store Name</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-left">Vendor Name</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">Current Stock</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">Total Sales Value</th>
                    <th className="py-2.5 px-3 border border-slate-300 text-right">Total Cost Value</th>
                  </tr>
                </thead>
                <tbody className="font-semibold">
                  {vendorReport.rows.map((r, i) => (
                    <tr key={`${r.storeName}-${r.vendorName}`} className="odd:bg-white even:bg-slate-50">
                      <td className="py-2.5 px-3 border border-slate-300 text-slate-500">{i + 1}</td>
                      <td className="py-2.5 px-3 border border-slate-300 text-slate-700">{r.storeName}</td>
                      <td className="py-2.5 px-3 border border-slate-300 font-bold text-slate-900">{r.vendorName}</td>
                      <td className="py-2.5 px-3 border border-slate-300 text-right">{int(r.qoh)}</td>
                      <td className="py-2.5 px-3 border border-slate-300 text-right">{fmt(r.salesValue)}</td>
                      <td className="py-2.5 px-3 border border-slate-300 text-right">{fmt(r.cogs)}</td>
                    </tr>
                  ))}
                  {vendorReport.rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-10 border border-slate-300 text-center text-slate-400 font-bold">
                        No stock found for these filters.
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-200 font-black text-slate-900 border-t-2 border-slate-900">
                    <td className="py-2.5 px-3 border border-slate-300" colSpan={2} />
                    <td className="py-2.5 px-3 border border-slate-300">Grand Total</td>
                    <td className="py-2.5 px-3 border border-slate-300 text-right">{int(vendorReport.grandTotal.qoh)}</td>
                    <td className="py-2.5 px-3 border border-slate-300 text-right">
                      {fmt(vendorReport.grandTotal.salesValue)}
                    </td>
                    <td className="py-2.5 px-3 border border-slate-300 text-right">{fmt(vendorReport.grandTotal.cogs)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <ReportOverlay html={reportHtml} onClose={() => setReportHtml(null)} />
    </div>
  );
};
