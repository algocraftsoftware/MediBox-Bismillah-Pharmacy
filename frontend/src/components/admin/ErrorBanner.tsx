"use client";

import React from "react";
import { AlertCircle, X } from "lucide-react";

// Fixed, top-center, dismissable red banner — used for blocking-error
// messages that need to be surfaced loudly regardless of where on the page
// the triggering field is (e.g. mobile-number validation, billing errors).
export const ErrorBanner: React.FC<{ message: string; onClose: () => void }> = ({ message, onClose }) => (
  <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] bg-[#dc2626] text-white font-bold text-sm px-5 py-3 rounded shadow-2xl flex items-center gap-3 max-w-lg">
    <AlertCircle className="w-5 h-5 shrink-0" />
    <span>{message}</span>
    <button onClick={onClose} className="ml-2 hover:bg-red-700 rounded p-0.5 shrink-0">
      <X className="w-4 h-4" />
    </button>
  </div>
);
