import { fmt, fmt4, upper } from "../../../lib/format";
import { amountInWords } from "../../../lib/numberToWords";

// =======================================================
// Shared report/PDF template — used by BOTH the Detail page's REPORT button
// (fed from live, possibly-unsaved local state so it can be previewed before
// SUBMIT) and the List page's PDF button (fed from the persisted record), so
// the two always render identical output. Laid out exactly like the GRN
// reports: same header, meta grid, item table, totals block and signatures.
// =======================================================

export interface AdjWithPoReportItem {
  itemCode: string | null;
  itemName: string;
  totalQtyPieces: number;
  batchNo: string;
  expiryDate: string;
  tradePrice: number;
  totalValue: number;
  vatAmt: number;
  discAmt: number;
  mrp: number;
  netTotal: number;
}

export interface AdjWithPoReportRtvLine {
  rtvNo: string;
  rtvAmount: number;
  adjustmentAmount: number;
}

export interface AdjWithPoReportTotals {
  totalTradeValue: number;
  totalVat: number;
  totalDiscount: number;
  rtvAdjustmentValue: number;
  netPayable: number;
}

export function buildAdjWithPoReportHtml(params: {
  transactionNo: string;
  statusText: string;
  storeName: string;
  storeAddress?: string | null;
  storePhone?: string | null;
  supplierName: string;
  orderNo?: string | null;
  invoiceNo: string;
  invoiceDate: string;
  viaText: string;
  department?: string | null;
  transactionDate?: string | null;
  remarks?: string | null;
  shopName: string | null;
  logoUrl: string | null;
  items: AdjWithPoReportItem[];
  rtvLines: AdjWithPoReportRtvLine[];
  totals: AdjWithPoReportTotals;
  receivedByName?: string | null;
  createdByName?: string | null;
  approvedByName?: string | null;
}): string {
  const {
    transactionNo, statusText, storeName, storeAddress, storePhone, supplierName, orderNo,
    invoiceNo, invoiceDate, viaText, department, transactionDate, remarks, shopName, logoUrl,
    items, rtvLines, totals, receivedByName, createdByName, approvedByName,
  } = params;

  const storeAddr = [storeAddress, storePhone].filter(Boolean).join(" — ");
  const itemRows = items
    .map(
      (it, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${upper(it.itemCode)}</td>
        <td>${upper(it.itemName)}</td>
        <td>${upper(it.batchNo)}</td>
        <td>${it.expiryDate || ""}</td>
        <td class="right">${it.totalQtyPieces}</td>
        <td class="right">${fmt(it.tradePrice)}</td>
        <td class="right">${fmt(it.totalValue)}</td>
        <td class="right">${fmt(it.vatAmt)}</td>
        <td class="right">${fmt(it.discAmt)}</td>
        <td class="right">${fmt(it.mrp)}</td>
        <td class="right">${fmt(it.netTotal)}</td>
      </tr>`
    )
    .join("");
  const rtvRows = rtvLines
    .map(
      (l, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${upper(l.rtvNo)}</td>
        <td class="right">${fmt(l.rtvAmount)}</td>
        <td class="right">${fmt(l.adjustmentAmount)}</td>
      </tr>`
    )
    .join("");

  return `
    <html><head><title>${upper(transactionNo)}</title>
    <style>
      * { box-sizing: border-box; }
      body{font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111;font-size:12px}
      .header{display:flex;align-items:center;gap:14px;margin-bottom:10px;border-bottom:2px solid #111;padding-bottom:10px}
      .header img{height:52px}
      h1{font-size:19px;margin:0;letter-spacing:.02em}
      .doc-title{font-size:13px;font-weight:bold;color:#374151;margin-top:2px}
      .meta{display:grid;grid-template-columns:1fr 1fr;gap:2px 24px;margin-bottom:14px;font-size:12px}
      .meta .row{display:flex;justify-content:space-between;border-bottom:1px dotted #ddd;padding:3px 0}
      .meta .row span:first-child{color:#555;font-weight:bold}
      .meta .row span:last-child{font-weight:bold}
      .remarks{margin:8px 0 14px;font-size:12px;color:#374151}
      .section{margin-top:16px;font-size:11px;font-weight:bold;text-transform:uppercase;color:#374151}
      table{width:100%;border-collapse:collapse;margin-top:6px}
      th,td{border:1px solid #d1d5db;padding:6px 8px;font-size:11px;text-align:left}
      th{background:#f1f5f9;font-weight:bold;text-transform:uppercase;font-size:10px}
      .right{text-align:right}
      tbody tr:nth-child(even){background:#fafafa}
      .totals-wrap{display:flex;justify-content:flex-end;margin-top:14px}
      .totals{width:280px;font-size:12px}
      .totals .row{display:flex;justify-content:space-between;padding:4px 10px;border-bottom:1px solid #eee}
      .totals .row.net{border-top:2px solid #111;border-bottom:none;font-weight:bold;font-size:13px;margin-top:4px;padding-top:8px}
      .words{margin-top:10px;font-size:11.5px;font-style:italic;color:#374151}
      .sign{display:flex;justify-content:space-between;margin-top:70px;font-size:12px}
      .sign div{border-top:1px solid #333;padding-top:5px;width:28%;text-align:center;color:#374151}
    </style></head><body>
    <div class="header">
      ${logoUrl ? `<img src="${logoUrl}" />` : ""}
      <div>
        <h1>${shopName || ""}</h1>
        ${storeAddr ? `<div style="font-size:11px;color:#555">${storeAddr}</div>` : ""}
        <div class="doc-title">Adjustment With PO</div>
      </div>
    </div>
    <div class="meta">
      <div class="row"><span>ADJ No.</span><span>${upper(transactionNo) || "—"}</span></div>
      <div class="row"><span>Status</span><span>${statusText}</span></div>
      <div class="row"><span>Order No.</span><span>${upper(orderNo) || "—"}</span></div>
      <div class="row"><span>Invoice No.</span><span>${upper(invoiceNo) || "—"}</span></div>
      <div class="row"><span>Invoice Date</span><span>${invoiceDate || "—"}</span></div>
      <div class="row"><span>ADJ Store</span><span>${storeName}</span></div>
      <div class="row"><span>Supplier</span><span>${upper(supplierName)}</span></div>
      <div class="row"><span>RTV Via</span><span>${viaText}</span></div>
      <div class="row"><span>Department</span><span>${department || "—"}</span></div>
      <div class="row"><span>Transaction Date</span><span>${transactionDate || "—"}</span></div>
    </div>
    ${remarks ? `<div class="remarks"><b>Remarks:</b> ${remarks}</div>` : ""}
    <div class="section">Items Received</div>
    <table><thead><tr>
      <th>Sl</th><th>Item No</th><th>Item Name</th><th>Batch</th><th>Exp. Date</th>
      <th class="right">Qty (Pcs)</th><th class="right">Unit Price</th><th class="right">Total</th>
      <th class="right">VAT</th><th class="right">Disc.</th><th class="right">MRP</th><th class="right">Net Total</th>
    </tr></thead><tbody>${itemRows}</tbody></table>
    <div class="section">RTV Adjustments</div>
    <table><thead><tr>
      <th>Sl</th><th>RTV No</th><th class="right">RTV Amount</th><th class="right">Adjustment Amt</th>
    </tr></thead><tbody>${rtvRows}</tbody></table>
    <div class="totals-wrap">
      <div class="totals">
        <div class="row"><span>Total Amount</span><span>${fmt4(totals.totalTradeValue)}</span></div>
        <div class="row"><span>Total VAT</span><span>${fmt4(totals.totalVat)}</span></div>
        <div class="row"><span>Total Discount</span><span>${fmt4(totals.totalDiscount)}</span></div>
        <div class="row"><span>RTV Adjustment</span><span>${fmt4(totals.rtvAdjustmentValue)}</span></div>
        <div class="row net"><span>Net Payable</span><span>${fmt4(totals.netPayable)}</span></div>
      </div>
    </div>
    <div class="words">In Words: ${amountInWords(totals.netPayable)}</div>
    <div class="sign">
      <div>${receivedByName || ""}<br/>Received By</div>
      <div>${createdByName || ""}<br/>Entry By</div>
      <div>${approvedByName || ""}<br/>Approved By</div>
    </div>
    </body></html>
  `;
}
