/**
 * Shared helpers used across all spec files.
 *
 * WHY NO cy.intercept() ALIASES HERE
 * ───────────────────────────────────
 * The app registers an MSW service worker in DEV mode.  MSW intercepts every
 * /api/* fetch at the service-worker layer — before Chrome's CDP network
 * events fire.  As a result cy.intercept() aliases never receive those
 * requests ("No request ever occurred").
 *
 * Helpers here use DOM-based synchronisation instead:
 *   visitForm  → wait for the "Add Person" button (both GET requests done)
 *   addPerson  → wait for a new .card element to appear (POST done)
 *   addTodo    → wait for a new tbody row to appear (POST done)
 *
 * For error-injection, use overrideMsw() which pushes handlers into the live
 * MSW worker instance exposed at window.__msw__ by main.tsx.
 *
 * Generate a unique formId per test with uniqueFormId() to avoid IndexedDB
 * state leaking between tests.
 */

import type { RequestHandler, WebSocketHandler } from "msw";

type AnyHandler = RequestHandler | WebSocketHandler;

// ── Form navigation ────────────────────────────────────────────────────────

/**
 * Return a formId that is guaranteed to be fresh (no existing IndexedDB data).
 * Call once per `it` / `beforeEach` and thread the value through all helpers.
 */
export function uniqueFormId(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Navigate to the form and block until the initial load completes.
 * The "Add Person" button only appears after both GET /persons and
 * GET /lookups succeed.
 */
export function visitForm(formId: string) {
  cy.visit(`/person-todos-json/${formId}`);
  cy.contains("button", "Add Person", { timeout: 12_000 }).should("be.visible");
}

// ── Entity creation ────────────────────────────────────────────────────────

/**
 * Click "Add Person" and wait for a new .card element to appear.
 * The formId parameter is kept for API symmetry but is no longer used for
 * network interception.
 */
export function addPerson(_formId?: string) {
  cy.get(".card").then(($cards) => {
    const before = $cards.length;
    cy.contains("button", "Add Person").click();
    cy.get(".card", { timeout: 12_000 }).should(
      "have.length.greaterThan",
      before,
    );
  });
}

/**
 * Click the nth "Add Todo" button (0-based) and wait for a new tbody row.
 */
export function addTodo(_formId?: string, personIndex = 0) {
  // Count only rows that contain actual todo fields (not the empty-state row).
  // The empty-state placeholder row has a single td with colspan; real rows have <select>/<input>.
  // We use jQuery .filter() callback which avoids CSS :has() selector compatibility issues.
  cy.get("tbody tr").then(($rows) => {
    const before = $rows.filter(function () {
      return (
        Cypress.$(this).find("select").length > 0 ||
        Cypress.$(this).find("input").length > 0
      );
    }).length;
    cy.contains("button", "Add Todo").eq(personIndex).click();
    cy.get("tbody tr").should(($newRows) => {
      const realRows = $newRows.filter(function () {
        return (
          Cypress.$(this).find("select").length > 0 ||
          Cypress.$(this).find("input").length > 0
        );
      });
      expect(realRows.length).to.be.greaterThan(before);
    });
  });
}

// ── Save-state synchronisation ─────────────────────────────────────────────

/**
 * Wait for the global "All changes saved" banner to appear.
 * Use this after field changes to confirm autosave completed before asserting
 * other UI state.
 */
export function waitForSaved(timeoutMs = 12_000) {
  cy.contains(/all changes saved/i, { timeout: timeoutMs }).should("exist");
}

// ── MSW handler overrides ──────────────────────────────────────────────────

/**
 * Push one or more MSW request handlers into the running service worker.
 * Injected handlers take precedence over the default mock handlers and stay
 * active until resetMswHandlers() is called (typically in afterEach).
 *
 * @example
 *   overrideMsw(
 *     http.patch('/api/forms/:formId/persons/:id', () =>
 *       HttpResponse.json({ message: 'err' }, { status: 500 })
 *     )
 *   );
 */
export function overrideMsw(...handlers: AnyHandler[]) {
  cy.window().then((win) => {
    const msw = (win as Window).__msw__;
    if (!msw) {
      throw new Error(
        "window.__msw__ not found – is the Vite dev server running?",
      );
    }
    msw.worker.use(...(handlers as Parameters<typeof msw.worker.use>));
  });
}

/**
 * Restore the MSW worker to its default handlers.
 * Call this in afterEach whenever overrideMsw() is used in a spec.
 */
export function resetMswHandlers() {
  cy.window().then((win) => {
    (win as Window).__msw__?.worker.resetHandlers();
  });
}

// ── Select-field helper ────────────────────────────────────────────────────

/** Select the first non-placeholder option in a <select> element. */
export function selectFirstOption<T extends HTMLElement>(
  selectEl: Cypress.Chainable<JQuery<T>>,
) {
  // Store the select element's value, then select via the <select> directly.
  // Do NOT chain off selectEl after .find() because .find() changes the subject.
  selectEl.then(($select) => {
    const $options = $select.find("option").filter(function () {
      const v = (this as unknown as HTMLOptionElement).value;
      return v !== "" && v !== undefined;
    });
    if ($options.length > 0) {
      const firstVal = ($options[0] as unknown as HTMLOptionElement).value;
      cy.wrap($select).select(firstVal);
    }
  });
}
