"use client";

import { useEffect } from "react";
import { shopApi } from "../services/api";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import {
  AdminSummary,
  LookupEntry,
  LookupName,
  lookupFailed,
  lookupReceived,
  lookupRequested,
  isLookupStale,
} from "../store/lookupsSlice";
import { Department, Supplier } from "../types";
import { useShopSession } from "../context/ShopSessionContext";

// How long a cached list is served before being fetched again. None of these
// can change from inside the shop app, so this is only a backstop for a tab
// left open while someone edits staff in the Super Admin dashboard.
const TTL_MS = 10 * 60 * 1000;

type Api = ReturnType<typeof shopApi>;

const EMPTY: never[] = [];

// Drop-in replacement for the `useState` + `useEffect` fetch each screen used
// to carry. Returns exactly what the endpoint returns; the only difference is
// that the first screen to ask pays for the request and the rest read the
// cached copy.
function useLookup<T>(name: LookupName, fetcher: (api: Api) => Promise<T[]>, api: Api): T[] {
  const dispatch = useAppDispatch();
  const { shopSlug } = useShopSession();
  const entry = useAppSelector((s) => s.lookups[name][shopSlug]) as LookupEntry<T> | undefined;

  const stale = isLookupStale(entry, TTL_MS);

  useEffect(() => {
    if (!shopSlug || !stale) return;
    dispatch(lookupRequested({ name, shopSlug }));
    fetcher(api)
      .then((data) => dispatch(lookupReceived({ name, shopSlug, data })))
      // Swallowed exactly as every call site did before: these lists feed
      // dropdown options, and a screen stays usable without them.
      .catch(() => dispatch(lookupFailed({ name, shopSlug })));

    // Deliberately no cleanup cancelling these dispatches. Dispatching the
    // result marks a Redux entry, not component state, so it is safe after an
    // unmount — and cancelling it was a real bug: `stale` flips to false the
    // instant lookupRequested marks the entry "loading", which re-runs this
    // effect's cleanup and would abandon the very request just started, so the
    // rows never arrived and every dropdown stayed empty.
    //
    // Re-running when `stale` changes is what allows a second screen to pick up
    // an expired list; it cannot loop, because every outcome leaves the entry
    // non-stale — "loading" while in flight, then "ready" or a timestamped
    // "failed" that is only retried after a pause.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, shopSlug, stale]);

  return entry?.data ?? EMPTY;
}

export const useSuppliers = (api: Api): Supplier[] =>
  useLookup<Supplier>("suppliers", (a) => a.getSuppliers(), api);

export const useDepartments = (api: Api): Department[] =>
  useLookup<Department>("departments", (a) => a.getDepartments(), api);

export const useAdmins = (api: Api): AdminSummary[] =>
  useLookup<AdminSummary>("admins", (a) => a.getAdmins(), api);
