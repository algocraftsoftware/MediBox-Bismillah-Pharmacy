"use client";

import { notFound, useParams } from "next/navigation";
import { Construction } from "lucide-react";
import { ALL_FEATURE_IDS } from "../../../../lib/menuFeatures";

export default function ComingSoonPage() {
  const params = useParams<{ module: string }>();

  // Only a recognized-but-unbuilt menu feature (internal-issue, internal-receive,
  // internal-requisition, req-central-warehouse) gets the "Coming Soon" screen —
  // anything else is a bad/typo'd URL and should be a real 404, not a page that
  // looks like a planned feature.
  if (!ALL_FEATURE_IDS.includes(params.module)) {
    notFound();
  }

  const title = params.module.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="flex flex-col items-center justify-center h-full bg-[#f8fafc] text-slate-500 gap-3">
      <Construction className="w-10 h-10 text-slate-400" />
      <h2 className="text-lg font-black text-slate-700">{title}</h2>
      <p className="text-sm font-semibold max-w-sm text-center">
        This module is part of the full MediBox Pharmacy ERP and is coming in a future update.
      </p>
    </div>
  );
}
