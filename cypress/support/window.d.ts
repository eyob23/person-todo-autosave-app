import type { SetupWorker } from "msw/browser";

declare global {
  interface Window {
    /** Exposed in DEV mode so Cypress tests can inject MSW request handlers. */
    __msw__?: {
      worker: SetupWorker;
    };
  }
}
