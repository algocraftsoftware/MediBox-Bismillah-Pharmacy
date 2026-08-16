"use client";

import React, { useEffect, useRef } from "react";

// Shared "print/PDF report" trigger for every report button across the app.
// Renders the report HTML into a hidden iframe purely to drive the
// browser's native print dialog (Destination: "Save as PDF" is this app's
// established, no-library PDF path, and that dialog already has its own
// preview pane) — there's no separate on-screen "Report Preview" step
// anymore, since stacking one in front of the native print dialog just
// meant showing the user two previews for one click.
export const ReportOverlay: React.FC<{ html: string | null; onClose: () => void }> = ({ html, onClose }) => {
  // An iframe's onLoad can fire more than once for the same srcDoc (e.g. once
  // for the initial blank document, once for the real content) — without this
  // guard that meant contentWindow.print() fired twice per open, showing the
  // print dialog twice in a row for a single click.
  const printedForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!html) printedForRef.current = null;
  }, [html]);

  if (!html) return null;

  return (
    <iframe
      title="Report"
      srcDoc={html}
      style={{ position: "fixed", left: "-9999px", top: 0, width: 1, height: 1, border: "none" }}
      onLoad={(e) => {
        if (printedForRef.current === html) return;
        printedForRef.current = html;
        try {
          e.currentTarget.contentWindow?.print();
        } catch {
          // ignore — some browsers block cross-frame print calls in edge cases
        }
        // A short delay so the browser has definitely captured the iframe's
        // content for its print dialog before we unmount it.
        setTimeout(onClose, 300);
      }}
    />
  );
};
