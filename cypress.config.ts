import { defineConfig } from "cypress";

export default defineConfig({
  e2e: {
    baseUrl: "http://localhost:5174",
    // MSW service worker is already registered by the app in dev mode –
    // no extra fixture server needed.
    specPattern: "cypress/e2e/**/*.cy.ts",
    supportFile: "cypress/support/e2e.ts",
    viewportWidth: 1280,
    viewportHeight: 900,
    defaultCommandTimeout: 8000,
  },
});
