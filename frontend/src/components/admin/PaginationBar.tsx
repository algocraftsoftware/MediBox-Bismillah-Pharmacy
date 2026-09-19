"use client";

import React from "react";

const MAX_PAGE_BUTTONS = 10;

// A sliding window of up to MAX_PAGE_BUTTONS page numbers centered on the
// current page, clamped to the valid [1, totalPages] range — keeps the
// numbered-button row compact even for lists with hundreds of pages.
function getPageWindow(page: number, totalPages: number): number[] {
  if (totalPages <= MAX_PAGE_BUTTONS) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  let start = Math.max(1, page - Math.floor(MAX_PAGE_BUTTONS / 2));
  const end = Math.min(totalPages, start + MAX_PAGE_BUTTONS - 1);
  start = Math.max(1, end - MAX_PAGE_BUTTONS + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

const NAV_BUTTON_CLASS =
  "px-3.5 py-1.5 rounded bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-white";

// Shared First/Previous/[page numbers]/Next/Last footer bar used by every
// paginated list screen.
export const PaginationBar: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  onFirst: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onLast: () => void;
  onPageChange: (page: number) => void;
}> = ({ page, totalPages, total, onFirst, onPrevious, onNext, onLast, onPageChange }) => {
  const pageWindow = getPageWindow(page, totalPages);
  return (
    <div className="bg-[#f1f5f9] border-t border-slate-300 px-4 py-2.5 flex items-center justify-between text-sm font-semibold text-slate-600 shrink-0">
      <div className="flex items-center gap-1.5">
        <button disabled={page <= 1} onClick={onFirst} className={NAV_BUTTON_CLASS}>
          First
        </button>
        <button disabled={page <= 1} onClick={onPrevious} className={NAV_BUTTON_CLASS}>
          Previous
        </button>
        {pageWindow.map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={
              p === page
                ? "px-3.5 py-1.5 rounded bg-blue-600 text-white font-bold border border-blue-600"
                : "px-3.5 py-1.5 rounded bg-white border border-slate-300 hover:bg-slate-50 text-blue-700"
            }
          >
            {p}
          </button>
        ))}
        <button disabled={page >= totalPages} onClick={onNext} className={NAV_BUTTON_CLASS}>
          Next
        </button>
        <button disabled={page >= totalPages} onClick={onLast} className={NAV_BUTTON_CLASS}>
          Last
        </button>
      </div>
      <div>
        <span>Total Record : </span>
        <span className="font-bold text-slate-900">{total.toLocaleString()}</span>
      </div>
    </div>
  );
};
