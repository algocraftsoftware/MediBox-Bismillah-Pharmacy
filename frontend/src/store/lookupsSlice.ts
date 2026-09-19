import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Department, Supplier } from "../types";

// =======================================================
// SHARED LOOKUP LISTS
//
// Suppliers, departments and the staff list are read by nearly every screen —
// suppliers alone are fetched from twenty-one different components — and each
// one was requesting them again on mount. Moving between GRN, Purchase Order
// and Stock Data re-fetched the same unchanged rows every time, and a screen
// with both a list and a detail panel open asked for them twice at once.
//
// None of these can change from inside a shop session: the API exposes no way
// to create a supplier or a department, and staff accounts are managed in the
// Super Admin dashboard. So the lists are fetched once and shared, with a TTL
// so a tab left open all day still picks up a change made elsewhere.
//
// This caches *when* the data is fetched, never what it contains — every screen
// still receives exactly the rows the server returned.
// =======================================================

export type LookupName = "suppliers" | "departments" | "admins";

export type AdminSummary = { id: number; name: string; username: string };

export interface LookupEntry<T> {
  data: T[];
  // "loading" also serves as the in-flight marker that stops two components
  // mounting at the same time from firing the same request twice. "failed"
  // records that an attempt was made and did not succeed, so a broken endpoint
  // is retried after a short pause instead of on every render.
  status: "idle" | "loading" | "ready" | "failed";
  fetchedAt: number | null;
}

export interface LookupsState {
  // Keyed by shop slug: switching shops must never show the previous shop's
  // suppliers, so each shop keeps its own entry rather than sharing one.
  suppliers: Record<string, LookupEntry<Supplier>>;
  departments: Record<string, LookupEntry<Department>>;
  admins: Record<string, LookupEntry<AdminSummary>>;
}

const empty = (): LookupEntry<never> => ({ data: [], status: "idle", fetchedAt: null });

const initialState: LookupsState = { suppliers: {}, departments: {}, admins: {} };

// How long to wait before trying again after a failed fetch. Short, so a blip
// recovers on the next screen, but not zero: without it a failing endpoint
// would be re-requested on every render.
export const FAILED_RETRY_MS = 30 * 1000;

// Whether a cached list should be fetched again. Lives here rather than inside
// the hook so the rule can be exercised directly by tests.
export function isLookupStale<T>(entry: LookupEntry<T> | undefined, ttlMs: number, now = Date.now()): boolean {
  if (!entry) return true;                       // never fetched
  if (entry.status === "loading") return false;  // already in flight — don't duplicate it
  if (entry.status === "idle") return true;      // never started
  if (entry.fetchedAt === null) return true;
  return now - entry.fetchedAt > (entry.status === "failed" ? FAILED_RETRY_MS : ttlMs);
}

const lookupsSlice = createSlice({
  name: "lookups",
  initialState,
  reducers: {
    lookupRequested(state, action: PayloadAction<{ name: LookupName; shopSlug: string }>) {
      const { name, shopSlug } = action.payload;
      const entry = state[name][shopSlug] ?? empty();
      state[name][shopSlug] = { ...entry, status: "loading" };
    },

    lookupReceived(
      state,
      action: PayloadAction<{ name: LookupName; shopSlug: string; data: unknown[] }>,
    ) {
      const { name, shopSlug, data } = action.payload;
      state[name][shopSlug] = { data, status: "ready", fetchedAt: Date.now() } as LookupEntry<never>;
    },

    // A failed fetch never caches an empty list as if it were real data: the
    // rows already held (if any) are kept, and the attempt is stamped so it is
    // retried shortly rather than immediately. Screens see an empty dropdown in
    // the meantime, exactly as they did when each fetched for itself.
    lookupFailed(state, action: PayloadAction<{ name: LookupName; shopSlug: string }>) {
      const { name, shopSlug } = action.payload;
      const entry = state[name][shopSlug] ?? empty();
      state[name][shopSlug] = { ...entry, status: "failed", fetchedAt: Date.now() };
    },

    // Forces one list to be fetched again. Creating a vendor is the case this
    // exists for: the cache is built on these lists not changing during a
    // session, which stopped being true the moment Create Vendor was added.
    lookupInvalidated(state, action: PayloadAction<{ name: LookupName; shopSlug: string }>) {
      const { name, shopSlug } = action.payload;
      delete state[name][shopSlug];
    },

    // Signing out of a shop clears what was cached for it.
    lookupsCleared(state, action: PayloadAction<{ shopSlug: string }>) {
      const { shopSlug } = action.payload;
      delete state.suppliers[shopSlug];
      delete state.departments[shopSlug];
      delete state.admins[shopSlug];
    },
  },
});

export const { lookupRequested, lookupReceived, lookupFailed, lookupInvalidated, lookupsCleared } =
  lookupsSlice.actions;
export default lookupsSlice.reducer;
