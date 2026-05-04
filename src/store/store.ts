import { configureStore } from "@reduxjs/toolkit";
import { personApi } from "../features/personTodo/personApi";

export const store = configureStore({
  reducer: {
    [personApi.reducerPath]: personApi.reducer
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(personApi.middleware)
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
