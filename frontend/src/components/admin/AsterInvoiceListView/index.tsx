"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CalendarDays, Download, Search } from "lucide-react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi, ApiError } from "../../../services/api";
import { Sale } from "../../../types";
import { InvoiceModal } from "../../InvoiceModal";
import { Spinner } from "../../Spinner";
import { PaginationBar } from "../PaginationBar";
import { PAGE_SIZE, toDateInput } from "./types";
import { ReceivePaymentModal } from "./ReceivePaymentModal";
import { DateFilterModal } from "./DateFilterModal";

export const AsterInvoiceListView: React.FC<{ dueOnly?: boolean; heightClassName?: string }> = ({
  dueOnly = false,
  heightClassName = "h-[calc(100vh-3.25rem)]",
}) => {
  const { stores, shopSlug, token } = useShopSession();
  const api = React.useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [storeId, setStoreId] = useState("");
  const [report, setReport] = useState<"Initial" | "Modified">("Initial");
  const [custType, setCustType] = useState("");
  const [orgName, setOrgName] = useState("");
  const [userId, setUserId] = useState("");
  const [custId, setCustId] = useState("");
  const [mobile, setMobile] = useState("");
  const [eidpf, setEidpf] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  // Search always scopes to a date range — defaulting both ends to today
  // means clicking SEARCH without touching the date filter shows just
  // today's invoices, matching the reference app. Due Collection is the
  // exception: unpaid invoices can be from any date, so it starts unscoped.
  const [from, setFrom] = useState(dueOnly ? "" : toDateInput(new Date()));
  const [to, setTo] = useState(dueOnly ? "" : toDateInput(new Date()));

  const [organizations, setOrganizations] = useState<string[]>([]);
  const [admins, setAdmins] = useState<{ id: number; name: string; username: string }[]>([]);

  const [rows, setRows] = useState<Sale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showDateModal, setShowDateModal] = useState(false);
  const [viewingSale, setViewingSale] = useState<Sale | null>(null);
  const [receivingSale, setReceivingSale] = useState<Sale | null>(null);
  const [loadingPdfId, setLoadingPdfId] = useState<number | null>(null);
  // The grid stays empty until SEARCH is clicked — no auto-load on entry.
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    api.getSaleOrganizations().then(setOrganizations).catch(() => {});
    api.getAdmins().then(setAdmins).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = useCallback(
    (targetPage = 1) => {
      setLoading(true);
      setError(null);
      setHasSearched(true);
      api
        .listSales({
          storeId: storeId || undefined,
          orgName: orgName || undefined,
          custType: custType || undefined,
          userId: userId || undefined,
          custId: custId || undefined,
          mobile: mobile || undefined,
          eidpf: eidpf || undefined,
          invoiceNo: invoiceNo || undefined,
          from: from || undefined,
          to: to || undefined,
          dueOnly: dueOnly ? "1" : undefined,
          page: targetPage,
          pageSize: PAGE_SIZE,
        })
        .then((res) => {
          setRows(res.rows);
          setTotal(res.total);
          setPage(res.page);
        })
        .catch((err) => setError(err instanceof ApiError ? err.message : "Failed to load invoices"))
        .finally(() => setLoading(false));
    },
    [api, storeId, orgName, custType, userId, custId, mobile, eidpf, invoiceNo, from, to, dueOnly]
  );

  // Due Collection's whole point is showing what's outstanding right away —
  // no reason to make the user click SEARCH first like the normal list.
  useEffect(() => {
    if (dueOnly) runSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClear = () => {
    setStoreId("");
    setReport("Initial");
    setCustType("");
    setOrgName("");
    setUserId("");
    setCustId("");
    setMobile("");
    setEidpf("");
    setInvoiceNo("");
    setFrom(dueOnly ? "" : toDateInput(new Date()));
    setTo(dueOnly ? "" : toDateInput(new Date()));
    setRows([]);
    setTotal(0);
    setHasSearched(false);
    if (dueOnly) setTimeout(() => runSearch(1), 0);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportInvoiceList({
        storeId: storeId || undefined,
        orgName: orgName || undefined,
        custType: custType || undefined,
        userId: userId || undefined,
        custId: custId || undefined,
        mobile: mobile || undefined,
        eidpf: eidpf || undefined,
        invoiceNo: invoiceNo || undefined,
        from: from || undefined,
        to: to || undefined,
        dueOnly: dueOnly ? "1" : undefined,
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleOpenPdf = async (saleId: number) => {
    setLoadingPdfId(saleId);
    setError(null);
    try {
      const sale = await api.getSale(saleId);
      setViewingSale(sale);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load invoice");
    } finally {
      setLoadingPdfId(null);
    }
  };

  const handleReceive = async (data: {
    paidCash: number;
    paidMobileBanking: number;
    paidCard: number;
    mobileBankingType?: string;
    transactionNumber?: string;
    cardType?: string;
    bankName?: string;
    remarks?: string;
  }) => {
    const saleId = receivingSale?.id;
    if (!saleId) return;
    await api.receiveDuePayment(saleId, data);
    setReceivingSale(null);
    runSearch(page);
    window.dispatchEvent(new CustomEvent("medibox:sale-created"));
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className={`flex flex-col ${heightClassName} bg-[#f8fafc] overflow-hidden`}>
      <div className="bg-white border-b border-slate-300 p-3 shadow-sm">
        <div className="grid grid-cols-7 gap-2.5 items-end text-xs mb-2.5">
          <div>
            <label className="font-bold text-slate-700 block mb-1">Warehouse</label>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">Select...</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Report</label>
            <select value={report} onChange={(e) => setReport(e.target.value as "Initial" | "Modified")} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="Initial">Initial</option>
              <option value="Modified">Modified</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Cust.Type</label>
            <select value={custType} onChange={(e) => setCustType(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">ALL</option>
              <option value="GENERAL">GENERAL</option>
              <option value="EMPLOYEE">EMPLOYEE</option>
              <option value="OTHER">OTHER</option>
              <option value="VVIP">VVIP</option>
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Organization</label>
            <select value={orgName} onChange={(e) => setOrgName(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">Select...</option>
              {organizations.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">User</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold">
              <option value="">Select...</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Cust.ID</label>
            <input
              value={custId}
              onChange={(e) => setCustId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch(1)}
              placeholder="Search By Customer ID..."
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Mobile</label>
            <input
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch(1)}
              placeholder="Search By Mobile No..."
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
        </div>

        <div className="grid grid-cols-6 gap-2.5 items-end text-xs">
          <div>
            <label className="font-bold text-slate-700 block mb-1">EID/PF No</label>
            <input
              value={eidpf}
              onChange={(e) => setEidpf(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch(1)}
              placeholder="Search By EID/PF No..."
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div>
            <label className="font-bold text-slate-700 block mb-1">Inv.No</label>
            <input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch(1)}
              placeholder="Search By Invoice No..."
              className="w-full border border-slate-300 rounded px-2 py-1.5 font-semibold"
            />
          </div>
          <div className="flex items-end gap-1.5">
            <button
              onClick={handleExport}
              disabled={exporting}
              title="Download Excel"
              className="bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white p-2 rounded"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowDateModal(true)}
              title="Filter by Date"
              className="bg-red-600 hover:bg-red-700 text-white p-2 rounded"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
            <button
              onClick={() => runSearch(1)}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded flex items-center justify-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              SEARCH
            </button>
            <button onClick={handleClear} className="flex-1 bg-[#dc2626] hover:bg-red-700 text-white font-bold py-2 rounded">
              CLEAR
            </button>
          </div>
        </div>
        {(from || to) && (
          <p className="text-xs font-bold text-slate-500 mt-1.5">
            Date range: {from || "…"} to {to || "…"}
          </p>
        )}
        {error && <p className="text-red-600 font-bold text-xs mt-2">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto bg-white">
        <table className="w-full table-fixed text-left border-collapse text-sm border border-slate-300">
          <thead>
            <tr className="bg-slate-200/90 text-slate-800 font-bold uppercase whitespace-nowrap sticky top-0">
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Invoice No</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Invoice Date</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Customer ID</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Customer Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Customer Type</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Contact No</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">EID/PF No</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Organization</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Doctor Name</th>
              <th className="py-4 px-3 border border-slate-300 w-[6%] truncate">Doctor Address</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Self/HD</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Remarks</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">Store</th>
              <th className="py-4 px-3 border border-slate-300 w-[5%] truncate">User</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Discount</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Discount(%)</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Paid Amt.</th>
              <th className="py-4 px-3 border border-slate-300 text-right w-[5%] truncate">Due Amt.</th>
              <th className="py-4 px-3 border border-slate-300 text-center w-[6%] truncate"></th>
            </tr>
          </thead>
          <tbody className="font-medium whitespace-nowrap">
            {rows.map((s) => (
              <tr key={s.id} className="odd:bg-white even:bg-slate-50 hover:bg-emerald-50/50">
                <td className="py-4 px-3 border border-slate-200 font-bold text-slate-900 truncate">{s.invoiceNo}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{new Date(s.createdAt).toLocaleString()}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.customer?.customerCode || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-900 font-bold truncate">{s.customer?.name || "Walk-in"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.customer?.custType || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.customer?.mobile || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.customer?.employeeId || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.customer?.orgName || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.doctorName || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.doctorAddress || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.deliveryMode === "DELIVERY" ? "HD" : "Self"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.remarks || "—"}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.store?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-slate-600 truncate">{s.cashier?.name}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{s.discAmt.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right truncate">{s.discPct.toFixed(2)}</td>
                <td className="py-4 px-3 border border-slate-200 text-right font-bold text-slate-900 truncate">{s.paidAmount.toFixed(2)}</td>
                <td className={`py-4 px-3 border border-slate-200 text-right font-bold truncate ${s.dueAmount > 0.01 ? "text-red-600" : "text-slate-400"}`}>
                  {s.dueAmount > 0.01 ? s.dueAmount.toFixed(2) : "0.00"}
                </td>
                <td className="py-4 px-3 border border-slate-200 text-center whitespace-nowrap truncate">
                  <button
                    onClick={() => handleOpenPdf(s.id)}
                    disabled={loadingPdfId === s.id}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-70 text-white text-[10px] font-bold px-2 py-1 rounded inline-flex items-center gap-1 min-w-9 justify-center"
                    title="View / Print PDF"
                  >
                    {loadingPdfId === s.id ? <Spinner size="xs" variant="white" /> : "PDF"}
                  </button>
                  {s.paymentStatus === "DUE" && s.dueAmount > 0.01 && (
                    <button
                      onClick={() => setReceivingSale(s)}
                      className="bg-[#ADEBB3] hover:bg-emerald-700 text-slate-900 hover:text-white text-[10px] font-bold px-2 py-1 rounded ml-1"
                      title="Receive payment against this due invoice"
                    >
                      RECEIVE
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={19} className="py-16 border border-slate-200 text-center text-slate-400 font-bold">
                  {loading ? (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading...
                    </span>
                  ) : !hasSearched ? (
                    "Click SEARCH to load today's invoices."
                  ) : dueOnly ? (
                    "No due invoices found."
                  ) : (
                    "No invoices found."
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={total}
        onFirst={() => runSearch(1)}
        onPrevious={() => runSearch(page - 1)}
        onNext={() => runSearch(page + 1)}
        onLast={() => runSearch(totalPages)}
        onPageChange={runSearch}
      />

      {showDateModal && (
        <DateFilterModal
          from={from}
          to={to}
          onApply={(f, t) => {
            setFrom(f);
            setTo(t);
            setTimeout(() => runSearch(1), 0);
          }}
          onClose={() => setShowDateModal(false)}
        />
      )}

      {viewingSale && <InvoiceModal sale={viewingSale} onClose={() => setViewingSale(null)} />}

      {receivingSale && (
        <ReceivePaymentModal
          sale={receivingSale}
          onConfirm={handleReceive}
          onClose={() => setReceivingSale(null)}
        />
      )}
    </div>
  );
};
