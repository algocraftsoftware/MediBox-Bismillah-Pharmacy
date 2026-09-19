"use client";

import React, { useMemo, useState } from "react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi } from "../../../services/api";
import { ListView } from "./ListView";
import { DetailView } from "./DetailView";

export const AsterAdjWithOthersView: React.FC = () => {
  const { shopSlug, token, stores } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [view, setView] = useState<"list" | "detail">("list");
  const [adjId, setAdjId] = useState<number | null>(null);

  if (view === "list") {
    return (
      <ListView
        api={api}
        onNew={() => {
          setAdjId(null);
          setView("detail");
        }}
        onEdit={(id) => {
          setAdjId(id);
          setView("detail");
        }}
      />
    );
  }
  return (
    <DetailView
      key={adjId ?? "new"}
      api={api}
      stores={stores}
      adjId={adjId}
      onBack={() => setView("list")}
      onCreated={(id) => setAdjId(id)}
      onNew={() => setAdjId(null)}
    />
  );
};
