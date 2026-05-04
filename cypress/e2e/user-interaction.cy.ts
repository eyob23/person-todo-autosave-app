/**
 * User interaction tests
 *
 * Covers: add / delete person, add / delete todo, autosave, submit flow.
 *
 * MSW intercepts /api/* requests at the service-worker layer before Chrome's
 * CDP network events fire, so cy.intercept() aliases never receive those
 * requests.  All synchronisation here is DOM-based:
 *   - After add/delete, wait for the relevant DOM element to appear/disappear
 *   - After field changes, wait for the "All changes saved" banner
 *
 * A fresh formId is generated per test to avoid IndexedDB state leaks.
 */

import {
  visitForm,
  addPerson,
  addTodo,
  selectFirstOption,
  waitForSaved,
  uniqueFormId,
} from "../support/helpers";

let formId: string;

function firstTodoTypeSelect() {
  return cy.get('select[aria-label*="Todo Type"]').first();
}

describe("User Interactions", () => {
  beforeEach(() => {
    formId = uniqueFormId();
    visitForm(formId);
  });

  // ── Add / Delete Person ──────────────────────────────────────────────────

  describe("Person management", () => {
    it("adds a new person card", () => {
      addPerson(formId);

      cy.contains("Person 1").should("exist");
    });

    it("shows a delete confirmation modal before removing a person", () => {
      addPerson(formId);

      cy.contains("button", "Delete Person").first().click();

      // Confirm modal appears
      cy.get(".modal").should("be.visible");
      cy.get(".modal").contains("Are you sure").should("exist");
    });

    it("cancels person deletion from the modal", () => {
      addPerson(formId);

      cy.contains("button", "Delete Person").first().click();
      cy.get(".modal").should("be.visible");

      // Click Cancel / close button
      cy.get(".modal")
        .contains("button", /cancel/i)
        .click();
      cy.get(".modal").should("not.exist");

      // Person card still present
      cy.contains("Person 1").should("exist");
    });

    it("confirms person deletion via the modal", () => {
      addPerson(formId);

      cy.get(".card").then(($cards) => {
        const before = $cards.length;
        cy.contains("button", "Delete Person").first().click();
        cy.get(".modal").should("be.visible");

        // Click the destructive Confirm button inside the modal
        cy.get(".modal")
          .contains("button", /delete/i)
          .click();

        // Wait for the card count to decrease
        cy.get(".card", { timeout: 8_000 }).should(
          "have.length.lessThan",
          before,
        );
      });
    });
  });

  // ── Add / Delete Todo ────────────────────────────────────────────────────

  describe("Todo management", () => {
    beforeEach(() => {
      addPerson(formId);
    });

    it("adds a todo row inside a person card", () => {
      addTodo(formId, 0);

      // At least one todo row should now be visible
      cy.get("table tbody tr").should("have.length.at.least", 1);
    });

    it("shows a delete confirmation modal before removing a todo", () => {
      addTodo(formId, 0);

      cy.get(`[aria-label*="Delete todo"]`).first().click();
      cy.get(".modal").should("be.visible");
      cy.get(".modal").contains("Are you sure").should("exist");
    });

    it("confirms todo deletion", () => {
      addTodo(formId, 0);

      cy.get(`[aria-label*="Delete todo"]`).first().click();
      cy.get(".modal").should("be.visible");
      cy.get(".modal")
        .contains("button", /delete/i)
        .click();

      // Wait for the real todo row to disappear
      cy.get("table tbody tr")
        .filter(":has(select, input)")
        .should("have.length", 0);
    });
  });

  // ── Autosave ─────────────────────────────────────────────────────────────

  describe("Autosave", () => {
    beforeEach(() => {
      addPerson(formId);
    });

    it("shows a saving/saved status after a person select field changes", () => {
      // Select the first real option in the Person Object select
      const personObjectSelect = cy
        .contains("label", /person object/i)
        .siblings("select")
        .first();
      selectFirstOption(personObjectSelect);

      // The queue should transition through Saving → Saved
      cy.contains(/saving|saved/i, { timeout: 8_000 }).should("exist");
    });

    it("shows 'Saving' status indicator while PATCH is in-flight", () => {
      const personObjectSelect = cy
        .contains("label", /person object/i)
        .siblings("select")
        .first();
      selectFirstOption(personObjectSelect);

      // MSW responds within ~250 ms; the "Saving" state should appear
      // momentarily before the response arrives.
      cy.contains(/saving/i).should("exist");
    });

    it("shows 'Saved' after a successful autosave", () => {
      const personObjectSelect = cy
        .contains("label", /person object/i)
        .siblings("select")
        .first();
      selectFirstOption(personObjectSelect);

      waitForSaved();
    });

    it("transitions to 'Saved' after a todo field autosave", () => {
      addTodo(formId, 0);

      const todoTypeSelect = firstTodoTypeSelect();
      selectFirstOption(todoTypeSelect);

      waitForSaved();
    });

    it("saves the first numeric edit after adding a new todo", () => {
      addTodo(formId, 0);

      // Regression: first edit on a newly added row must enqueue and save.
      cy.get('input[aria-label*="Completed count"]').first().clear().type("1");

      waitForSaved();
    });
  });

  // ── Submit ────────────────────────────────────────────────────────────────

  describe("Submit flow", () => {
    it("clicking Submit without filling required fields shows validation errors", () => {
      addPerson(formId);

      cy.contains("button", "Submit").click();

      // At least one required-field error should appear
      cy.contains(/required/i).should("exist");
    });

    it("submits successfully when all required fields are filled", () => {
      addTodo(formId, 0);

      // Fill all required person fields and wait for autosave to settle
      selectFirstOption(
        cy
          .contains("label", /person object/i)
          .siblings("select")
          .first(),
      );
      selectFirstOption(
        cy.contains("label", /sex/i).siblings("select").first(),
      );
      selectFirstOption(
        cy
          .contains("label", /gender/i)
          .siblings("select")
          .first(),
      );

      // Fill all required todo fields
      selectFirstOption(firstTodoTypeSelect());
      cy.get(
        'input[aria-label*="Completed count"], input[placeholder*="Completed"], input[name*="completedCount"]',
      )
        .first()
        .clear()
        .type("1");
      cy.get(
        'input[aria-label*="In progress count"], input[placeholder*="In progress"], input[name*="inProgressCount"]',
      )
        .first()
        .clear()
        .type("1");

      // Wait until all field-level autosaves have completed
      waitForSaved(20_000);

      // Submit
      cy.contains("button", "Submit").click();

      cy.contains(/submitted/i, { timeout: 15_000 }).should("exist");
    });
  });
});
