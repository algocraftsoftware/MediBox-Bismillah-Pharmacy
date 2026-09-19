import { fmt, fmt4, upper } from "../../../lib/format";
import { amountInWords } from "../../../lib/numberToWords";

// =======================================================
// Shared report/PDF template — used by BOTH the Detail page's REPORT button
// (fed from live, possibly-unsaved local state so it can be previewed before
// SUBMIT) and the List page's PDF button (fed from the persisted record), so
// the two always render identical output. Laid out exactly like the GRN and
// Adjust With PO reports.
//
// There are no items here: an Adjustment With Others moves no stock, it only
// settles RTV value, so the RTV lines are the whole document.
// =======================================================

export interface AdjOthersReportRtvLine {
  rtvNo: string;
  rtvDate: string;
  storeName: string;
  rtvAmount: number;
  adjustmentAmount: number;
}

export function buildAdjOthersReportHtml(params: {
  txnNo: string;
  statusText: string;
  storeName: string;
  storeAddress?: string | null;
  storePhone?: string | null;
  supplierName: string;
  adjTypeText: string;
  viaText: string;
  transactionDate?: string | null;
  approvedAt?: string | null;
  remarks?: string | null;
  shopName: string | null;
  logoUrl: string | null;
  rtvLines: AdjOthersReportRtvLine[];
  totalAdjustmentAmount: number;
  createdByName?: string | null;
  approvedByName?: string | null;
}): string {
  const {
    txnNo, statusText, storeName, storeAddress, storePhone, supplierName, adjTypeText, viaText,
    transactionDate, approvedAt, remarks, shopName, logoUrl, rtvLines, totalAdjustmentAmount,
    createdByName, approvedByName,
  } = params;

  const storeAddr = [storeAddress, storePhone].filter(Boolean).join(" — ");
  const rtvRows = rtvLines
    .map(
      (l, idx) => `<tr>
        <td>${idx + 1}</td>
        <td>${upper(l.rtvNo)}</td>
        <td>${l.rtvDate || ""}</td>
        <td>${l.storeName || ""}</td>
        <td class="right">${fmt(l.rtvAmount)}</td>
        <td class="right">${fmt(l.adjustmentAmount)}</td>
      </tr>`
    )
    .join("");

  return `
    <html><head><title>${upper(txnNo)}</title>
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
        <div class="doc-title">Adjustment With Others</div>
      </div>
    </div>
    <div class="meta">
      <div class="row"><span>Trans. No.</span><span>${upper(txnNo) || "—"}</span></div>
      <div class="row"><span>Status</span><span>${statusText}</span></div>
      <div class="row"><span>ADJ Store</span><span>${storeName}</span></div>
      <div class="row"><span>Supplier</span><span>${upper(supplierName)}</span></div>
      <div class="row"><span>Adjustment Type</span><span>${adjTypeText}</span></div>
      <div class="row"><span>RTV Via</span><span>${viaText}</span></div>
      <div class="row"><span>Transaction Date</span><span>${transactionDate || "—"}</span></div>
      <div class="row"><span>Approved Date</span><span>${approvedAt || "—"}</span></div>
    </div>
    ${remarks ? `<div class="remarks"><b>Remarks:</b> ${remarks}</div>` : ""}
    <div class="section">RTV Adjustments</div>
    <table><thead><tr>
      <th>Sl</th><th>RTV No</th><th>RTV Date</th><th>Store Name</th>
      <th class="right">RTV Amount</th><th class="right">Adjustment Amt</th>
    </tr></thead><tbody>${rtvRows}</tbody></table>
    <div class="totals-wrap">
      <div class="totals">
        <div class="row net"><span>RTV Adj. Amt</span><span>${fmt4(totalAdjustmentAmount)}</span></div>
      </div>
    </div>
    <div class="words">In Words: ${amountInWords(totalAdjustmentAmount)}</div>
    <div class="sign">
      <div>${createdByName || ""}<br/>Prepared By</div>
      <div><br/>Checked By</div>
      <div>${approvedByName || ""}<br/>Approved By</div>
    </div>
    </body></html>
  `;
}
