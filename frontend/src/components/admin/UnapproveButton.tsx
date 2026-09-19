"use client";

import React, { useState } from "react";
import { RotateCcw } from "lucide-react";
import { useShopSession } from "../../context/ShopSessionContext";
import { ApiError } from "../../services/api";
import { Spinner } from "../Spinner";

// Sends an approved document back to unapproved so it can be corrected.
//
// Shared by all eight document modules (Requisition, Purchase Order, GRN With
// and Without PO, VST, RTV, and both Adjustments) so the guard rails are the
// same everywhere rather than re-implemented eight times.
//
// It renders nothing at all for a staff account. The server refuses the call
// regardless — that is where the rule actually lives — but offering a button
// that can only fail is a worse experience than not offering it, and this
// reads the role the session refreshed from the account row, so revoking
// someone's admin rights removes the button without them re-logging in.
export const UnapproveButton: React.FC<{
  // The document's current status; the button only appears on an approved one.
  status: string | undefined;
  // What un-approving this document will undo, in the confirmation prompt —
  // e.g. "GRN GRN2026010001". Kept explicit so each screen names its own
  // document the way the user knows it.
  label: string;
  // Whether reversing this document moves stock back. Only affects the wording
  // of the confirmation, so the admin knows when it is more than a status flip.
  movesStock?: boolean;
  onUnapprove: () => Promise<unknown>;
  onDone: (result: unknown) => void;
  onError: (message: string) => void;
  className?: string;
}> = ({ status, label, movesStock = false, onUnapprove, onDone, onError, className = "" }) => {
  const { adminRole } = useShopSession();
  const [busy, setBusy] = useState(false);

  if (adminRole !== "ADMIN") return null;
  if (status !== "APPROVED" && status !== "FINAL_APPROVED") return null;

  const handle = async () => {
    const warning = movesStock
      ? `Un-approve ${label}?\n\nThe stock it moved will be reversed and the document will reopen for editing.`
      : `Un-approve ${label}?\n\nIt will reopen for editing.`;
    if (!window.confirm(warning)) return;

    setBusy(true);
    onError("");
    try {
      const result = await onUnapprove();
      onDone(result);
    } catch (err) {
      // The server explains refusals precisely — stock already sold, a GRN
      // raised against this order — so its message is shown as-is rather than
      // flattened into a generic failure.
      onError(err instanceof ApiError ? err.message : "Could not un-approve this document");
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={busy}
      title="Send this document back to unapproved so it can be edited"
      className={`bg-amber-100 hover:bg-amber-200 disabled:opacity-40 text-amber-800 border border-amber-300 font-bold py-2 px-6 rounded inline-flex items-center justify-center gap-2 ${className}`}
    >
      {busy ? (
        <>
          <Spinner size="xs" /> UN-APPROVING...
        </>
      ) : (
        <>
          <RotateCcw className="w-4 h-4" /> UN-APPROVE
        </>
      )}
    </button>
  );
};
