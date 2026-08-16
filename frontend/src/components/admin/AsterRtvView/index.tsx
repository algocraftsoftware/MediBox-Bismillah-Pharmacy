"use client";

import React, { useMemo, useState } from "react";
import { useShopSession } from "../../../context/ShopSessionContext";
import { shopApi } from "../../../services/api";
import { ListView } from "./ListView";
import { DetailView } from "./DetailView";

export const AsterRtvView: React.FC = () => {
  const { shopSlug, token, stores } = useShopSession();
  const api = useMemo(() => shopApi(shopSlug, token), [shopSlug, token]);

  const [view, setView] = useState<"list" | "detail">("list");
  const [rtvId, setRtvId] = useState<number | null>(null);

  if (view === "list") {
    return (
      <ListView
        api={api}
        onNew={() => {
          setRtvId(null);
          setView("detail");
        }}
        onEdit={(id) => {
          setRtvId(id);
          setView("detail");
        }}
      />
    );
  }
  return (
    <DetailView
      key={rtvId ?? "new"}
      api={api}
      stores={stores}
      rtvId={rtvId}
      onBack={() => setView("list")}
      onCreated={(id) => setRtvId(id)}
      onNew={() => setRtvId(null)}
    />
  );
};
