"use client";

import React, { useRef, useState } from "react";
import { FileText, Paperclip } from "lucide-react";
import { Spinner } from "../Spinner";

// Attaches the supplier's invoice to a GRN or an adjustment — a photo, a PDF or
// a document — and links to it once attached.
//
// The button used to be a plain <button> with nothing behind it, so clicking it
// did nothing at all. A file input cannot be styled to match the rest of the
// toolbar, so the real input is kept hidden and the button opens it; that is
// the standard way to keep the picker's behaviour and the app's appearance.
//
// Uploading needs a saved document to attach to, so on the New screen — where
// it does not exist yet — the control explains that instead of failing.
export const GrnAttachment: React.FC<{
  attachmentUrl?: string | null;
  // Absent until the document has been saved.
  onUpload?: (file: File) => Promise<unknown>;
  onUploaded?: (result: unknown) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  // What this document is called in the hover text — "GRN" on the GRN screens,
  // "adjustment" on the two Adjust screens.
  docLabel?: string;
}> = ({ attachmentUrl, onUpload, onUploaded, onError, disabled, docLabel = "GRN" }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file || !onUpload) return;
    setBusy(true);
    onError?.("");
    try {
      onUploaded?.(await onUpload(file));
    } catch (err) {
      onError?.(err instanceof Error ? err.message : "Could not attach that file");
    } finally {
      setBusy(false);
      // Cleared so choosing the same file again still fires a change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const unsaved = !onUpload;

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.rtf"
        className="hidden"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || disabled || unsaved}
        title={
          unsaved
            ? `Save this ${docLabel} first, then attach the purchase invoice`
            : "Attach a photo, PDF or document of the purchase invoice"
        }
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold px-5 py-1.5 rounded inline-flex items-center gap-2"
      >
        {busy ? (
          <>
            <Spinner size="xs" variant="white" /> Uploading...
          </>
        ) : (
          <>
            <Paperclip className="w-4 h-4" />
            Choose File
          </>
        )}
      </button>

      {attachmentUrl && (
        <a
          href={attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-700 hover:text-blue-900 font-bold text-xs inline-flex items-center gap-1 underline underline-offset-2"
        >
          <FileText className="w-3.5 h-3.5" />
          View invoice
        </a>
      )}
    </div>
  );
};
