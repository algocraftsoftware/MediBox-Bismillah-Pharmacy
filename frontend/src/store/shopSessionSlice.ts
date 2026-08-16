import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ShopAdminRole, Store } from "../types";

// Mirrors the exact shape ShopSessionContext's local `value` state held
// before this migration — same fields, same meaning, nothing added/removed.
export interface ShopSessionData {
  token: string;
  shopSlug: string;
  shopName: string;
  logoUrl: string | null;
  preparedBySignatureUrl: string | null;
  reviewedBySignatureUrl: string | null;
  approvedBySignatureUrl: string | null;
  shopAddress: string | null;
  shopPhone: string | null;
  adminName: string;
  adminRole: ShopAdminRole;
  permissions: string[];
  stores: Store[];
  selectedStoreId: number | null;
}

interface ShopSessionState {
  ready: boolean;
  retrying: boolean;
  value: ShopSessionData | null;
}

const initialState: ShopSessionState = {
  ready: false,
  retrying: false,
  value: null,
};

const shopSessionSlice = createSlice({
  name: "shopSession",
  initialState,
  reducers: {
    // Fired once when ShopSessionProvider mounts, before its load effect
    // runs — reproduces useState's "always starts fresh per mount" default,
    // since (unlike component state) the Redux store survives an unmount.
    shopSessionReset(state) {
      state.ready = false;
      state.retrying = false;
      state.value = null;
    },
    shopSessionLoaded(state, action: PayloadAction<ShopSessionData>) {
      state.value = action.payload;
      state.ready = true;
      state.retrying = false;
    },
    shopSessionRetrying(state) {
      state.retrying = true;
    },
    shopSessionStoreSelected(state, action: PayloadAction<number>) {
      if (state.value) state.value.selectedStoreId = action.payload;
    },
  },
});

export const { shopSessionReset, shopSessionLoaded, shopSessionRetrying, shopSessionStoreSelected } =
  shopSessionSlice.actions;

export default shopSessionSlice.reducer;
