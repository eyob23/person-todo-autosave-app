import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { store } from "./store/store";
import App from "./App";

import "@coreui/coreui/dist/css/coreui.min.css";
import "./styles.css";

function registerErrorTelemetryConsoleLogger() {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("person-todo:error", (event) => {
    const customEvent = event as CustomEvent;
    console.log("[person-todo:error]", customEvent.detail);
  });
}

function registerTraceTelemetryConsoleLogger() {
  if (typeof window === "undefined") {
    return;
  }

  window.addEventListener("person-todo:trace", (event) => {
    const customEvent = event as CustomEvent;
    console.log("[person-todo:trace]", customEvent.detail);
  });
}

async function enableMocking() {
  if (!import.meta.env.DEV) {
    return;
  }

  const { worker } = await import("./mocks/browser");
  await worker.start({ onUnhandledRequest: "bypass" });

  // Expose the worker so Cypress tests can inject handlers via worker.use()
  // without replacing the service worker itself.
  window.__msw__ = { worker };
}

enableMocking().then(() => {
  registerErrorTelemetryConsoleLogger();
  if (import.meta.env.DEV) {
    registerTraceTelemetryConsoleLogger();
  }

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <Provider store={store}>
        <App />
      </Provider>
    </React.StrictMode>,
  );
});
