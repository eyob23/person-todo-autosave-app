/**
 * Data validation tests
 *
 * Covers every Yup rule in validation.ts:
 *  - Person required fields (personObjectPickId, sexId, genderId)
 *  - Todo required fields (todoTypeId, completedCount, inProgressCount)
 *  - Minimum value (no negative counts)
 *  - Cross-field rule: at least one of completedCount / inProgressCount > 0
 *  - Min-length arrays: at least one todo per person, at least one person
 *
 * Errors are surfaced by React Hook Form on submit (submitAttempted gate) so
 * each scenario clicks Submit first, then asserts the error text.
 *
 * Each test uses a fresh formId (via uniqueFormId()) to avoid IndexedDB state
 * leaking from previous test runs.
 */

import {
  visitForm,
  addTodo,
  selectFirstOption,
  uniqueFormId,
} from "../support/helpers";

// A fresh formId is set for every test in the top-level beforeEach.
let formId: string;

function firstTodoTypeSelect() {
  return cy.get('select[aria-label*="Todo Type"]').first();
}

// ── helpers ────────────────────────────────────────────────────────────────

/** Fill every required person field except the ones listed in `skip`. */
function fillPersonFields(skip: string[] = []) {
  if (!skip.includes("personObjectPickId")) {
    selectFirstOption(
      cy
        .contains("label", /person object/i)
        .siblings("select")
        .first(),
    );
  }
  if (!skip.includes("sexId")) {
    selectFirstOption(cy.contains("label", /^sex/i).siblings("select").first());
  }
  if (!skip.includes("genderId")) {
    selectFirstOption(
      cy
        .contains("label", /gender/i)
        .siblings("select")
        .first(),
    );
  }
}

/** Fill every required todo field except the ones listed in `skip`. */
function fillTodoFields(
  completedCount: number | null = 1,
  inProgressCount: number | null = 0,
  skipTodoType = false,
) {
  if (!skipTodoType) {
    selectFirstOption(firstTodoTypeSelect());
  }
  if (completedCount !== null) {
    cy.get('input[aria-label*="Completed"], input[name*="completedCount"]')
      .first()
      .clear()
      .type(String(completedCount));
  }
  if (inProgressCount !== null) {
    cy.get('input[aria-label*="In progress"], input[name*="inProgressCount"]')
      .first()
      .clear()
      .type(String(inProgressCount));
  }
}

/** Click Submit (which triggers RHF validation) and wait for errors. */
function submitAndWaitForErrors() {
  cy.contains("button", "Submit").click();
  // Give React Hook Form a tick to render errors
  cy.contains(/required|must be|at least/i).should("exist");
}

// ── specs ──────────────────────────────────────────────────────────────────

describe("Data Validation", () => {
  // Give every test its own fresh formId so IndexedDB state never leaks.
  beforeEach(() => {
    formId = uniqueFormId();
    visitForm(formId);
  });

  // ── Person-level validations ───────────────────────────────────────────

  describe("Person required fields", () => {
    beforeEach(() => {
      addTodo(formId, 0);
      // Fill todo so it doesn't produce extra noise
      fillTodoFields(1, 0);
    });

    it("shows an error when Person Object is empty", () => {
      fillPersonFields(["personObjectPickId"]);
      submitAndWaitForErrors();
      cy.contains(/please fix validation errors before submitting/i).should(
        "exist",
      );
    });

    it("shows an error when Sex is empty", () => {
      fillPersonFields(["sexId"]);
      submitAndWaitForErrors();
      cy.contains(/please fix validation errors before submitting/i).should(
        "exist",
      );
    });

    it("shows an error when Gender is empty", () => {
      fillPersonFields(["genderId"]);
      submitAndWaitForErrors();
      cy.contains(/please fix validation errors before submitting/i).should(
        "exist",
      );
    });

    it("shows no person-field errors when all person fields are filled", () => {
      fillPersonFields();
      cy.contains("button", "Submit").click();
      // No person-field errors should appear
      cy.contains(/person object is required/i).should("not.exist");
      cy.contains(/sex is required/i).should("not.exist");
      cy.contains(/gender is required/i).should("not.exist");
    });
  });

  // ── Todo-level validations ─────────────────────────────────────────────

  describe("Todo required fields", () => {
    beforeEach(() => {
      addTodo(formId, 0);
      fillPersonFields();
    });

    it("shows an error when Todo Type is empty", () => {
      fillTodoFields(1, 0, /* skipTodoType */ true);
      submitAndWaitForErrors();
      cy.contains(/please fix validation errors before submitting/i).should(
        "exist",
      );
    });

    it("shows an error when Completed Count is empty", () => {
      selectFirstOption(firstTodoTypeSelect());
      // Leave completedCount blank; provide inProgressCount > 0 so only
      // the missing-count error fires (not the cross-field rule).
      cy.get('input[aria-label*="In progress"], input[name*="inProgressCount"]')
        .first()
        .clear()
        .type("1");

      cy.contains("button", "Submit").click();
      cy.contains(/completed count is required/i).should("exist");
    });

    it("shows an error when In Progress Count is empty", () => {
      selectFirstOption(firstTodoTypeSelect());
      cy.get('input[aria-label*="Completed"], input[name*="completedCount"]')
        .first()
        .clear()
        .type("1");

      cy.contains("button", "Submit").click();
      cy.contains(/in progress count is required/i).should("exist");
    });
  });

  // ── Numeric constraint validations ────────────────────────────────────

  describe("Count field constraints", () => {
    beforeEach(() => {
      addTodo(formId, 0);
      fillPersonFields();
      selectFirstOption(firstTodoTypeSelect());
    });

    it("rejects a negative Completed Count", () => {
      cy.get('input[aria-label*="Completed"], input[name*="completedCount"]')
        .first()
        .clear()
        .type("-1");
      cy.get('input[aria-label*="In progress"], input[name*="inProgressCount"]')
        .first()
        .clear()
        .type("1");

      cy.contains("button", "Submit").click();
      cy.contains(/cannot be negative/i).should("exist");
    });

    it("rejects a negative In Progress Count", () => {
      cy.get('input[aria-label*="Completed"], input[name*="completedCount"]')
        .first()
        .clear()
        .type("1");
      cy.get('input[aria-label*="In progress"], input[name*="inProgressCount"]')
        .first()
        .clear()
        .type("-1");

      cy.contains("button", "Submit").click();
      cy.contains(/cannot be negative/i).should("exist");
    });
  });

  // ── Cross-field rule ──────────────────────────────────────────────────

  describe("Cross-field: at least one count > 0", () => {
    beforeEach(() => {
      addTodo(formId, 0);
      fillPersonFields();
      selectFirstOption(firstTodoTypeSelect());
    });

    it("shows an error when both Completed and In Progress are 0", () => {
      cy.get('input[aria-label*="Completed"], input[name*="completedCount"]')
        .first()
        .clear()
        .type("0");
      cy.get('input[aria-label*="In progress"], input[name*="inProgressCount"]')
        .first()
        .clear()
        .type("0");

      cy.contains("button", "Submit").click();
      cy.contains(/at least one of completed or in progress/i).should("exist");
    });

    it("passes when Completed > 0 and In Progress is 0", () => {
      cy.get('input[aria-label*="Completed"], input[name*="completedCount"]')
        .first()
        .clear()
        .type("1");
      cy.get('input[aria-label*="In progress"], input[name*="inProgressCount"]')
        .first()
        .clear()
        .type("0");

      cy.contains("button", "Submit").click();
      cy.contains(/at least one of completed or in progress/i).should(
        "not.exist",
      );
    });

    it("passes when In Progress > 0 and Completed is 0", () => {
      cy.get('input[aria-label*="Completed"], input[name*="completedCount"]')
        .first()
        .clear()
        .type("0");
      cy.get('input[aria-label*="In progress"], input[name*="inProgressCount"]')
        .first()
        .clear()
        .type("3");

      cy.contains("button", "Submit").click();
      cy.contains(/at least one of completed or in progress/i).should(
        "not.exist",
      );
    });
  });

  // ── Array min-length rules ────────────────────────────────────────────

  describe("Array minimum length", () => {
    it("shows an error when a person has no todos", () => {
      fillPersonFields();
      // Deliberately do NOT add a todo

      cy.contains("button", "Submit").click();
      cy.contains(/please fix validation errors before submitting/i).should(
        "exist",
      );
    });

    it("shows an error when the form has no persons at all", () => {
      // Fresh formIds are seeded with one person; remove it, then submit.
      cy.contains("button", "Delete Person").first().click();
      cy.get(".modal").should("be.visible");
      cy.get(".modal")
        .contains("button", /delete/i)
        .click();
      cy.contains("button", "Submit").click();
      cy.contains(
        /at least one person is required|please fix validation errors/i,
      ).should("exist");
    });
  });
});
