import { configureStore } from "@reduxjs/toolkit";
import shopSessionReducer from "./shopSessionSlice";
import lookupsReducer from "./lookupsSlice";

export const store = configureStore({
  reducer: {
    shopSession: shopSessionReducer,
    lookups: lookupsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
