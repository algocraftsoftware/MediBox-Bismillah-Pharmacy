"use client";

import React, { useMemo, useState } from "react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi } from "../../../services/api";
import { ListView } from "./ListView";
import { DetailView } from "./DetailView";

export const AsterVstView: React.FC = () => {
  const { shopSlug, token, stores } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [view, setView] = useState<"list" | "detail">("list");
  const [vstId, setVstId] = useState<number | null>(null);

  if (view === "list") {
    return (
      <ListView
        api={api}
        onNew={() => {
          setVstId(null);
          setView("detail");
        }}
        onEdit={(id) => {
          setVstId(id);
          setView("detail");
        }}
      />
    );
  }
  return (
    <DetailView
      key={vstId ?? "new"}
      api={api}
      stores={stores}
      vstId={vstId}
      onBack={() => setView("list")}
      onCreated={(id) => setVstId(id)}
      onNew={() => setVstId(null)}
    />
  );
};
