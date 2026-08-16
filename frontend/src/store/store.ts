import { configureStore } from "@reduxjs/toolkit";
import shopSessionReducer from "./shopSessionSlice";

export const store = configureStore({
  reducer: {
    shopSession: shopSessionReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
