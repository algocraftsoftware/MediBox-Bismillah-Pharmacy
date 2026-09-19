import { configureStore } from "@reduxjs/toolkit";
import shopSessionReducer from "./shopSessionSlice";
<<<<<<< HEAD
import lookupsReducer from "./lookupsSlice";
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77

export const store = configureStore({
  reducer: {
    shopSession: shopSessionReducer,
<<<<<<< HEAD
    lookups: lookupsReducer,
=======
>>>>>>> 818c00e39714eade44831f61e1109ac4c86d1b77
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
