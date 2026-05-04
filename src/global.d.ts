/// <reference types="vite/client" />

declare module "*.css";

declare module "@coreui/coreui/dist/css/coreui.min.css";

interface Window {
  /** Exposed in DEV mode so Cypress tests can inject MSW request handlers. */
  __msw__?: {
    worker: import("msw/browser").SetupWorker;
  };
}
