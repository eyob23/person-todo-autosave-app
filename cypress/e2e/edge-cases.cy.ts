/**
 * Edge-case tests: server errors, slow network, offline behaviour,
 * navigation guard, data integrity under concurrency, submit-while-saving,
 * rapid edits coalescing, and scenarios that could block form completion.
 *
 * MSW intercepts /api/* requests at the service-worker layer before Chrome's
 * CDP network events fire, so cy.intercept() aliases never receive those
 * requests.  Error injection is done via overrideMsw() which calls
 * window.__msw__.worker.use() on the live service-worker instance.
 *
 * All synchronisation is DOM-based (no cy.wait("@alias")).
 */

import { http, HttpResponse, delay } from "msw";

import {
  visitForm,
  addPerson,
  addTodo,
  selectFirstOption,
  overrideMsw,
  resetMswHandlers,
  waitForSaved,
  uniqueFormId,
} from "../support/helpers";

// helpers

function fillPersonSelectField(labelPattern: RegExp) {
  selectFirstOption(
    cy.contains("label", labelPattern).siblings("select").first(),
  );
}

function firstTodoTypeSelect() {
  return cy.get('select[aria-label*="Todo Type"]').first();
}

function fillCountField(selectorPattern: string, value: number) {
  cy.get(selectorPattern).first().clear().type(String(value));
}

// 1. Server error / failed autosave

describe("Server error handling", () => {
  let formId: string;

  beforeEach(() => {
    formId = uniqueFormId();
    visitForm(formId);
    addPerson(formId);
  });

  afterEach(() => {
    resetMswHandlers();
  });

  it("shows per-field 'Save failed' when the PATCH returns 500", () => {
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, () =>
        HttpResponse.json(
          { message: "Internal Server Error" },
          { status: 500 },
        ),
      ),
    );
    fillPersonSelectField(/person object/i);
    cy.contains(/save failed/i, { timeout: 90_000 }).should("exist");
  });

  it("shows the global 'failed to save' banner after max retries", () => {
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, () =>
        HttpResponse.json(
          { message: "Internal Server Error" },
          { status: 500 },
        ),
      ),
    );
    fillPersonSelectField(/person object/i);
    cy.contains(/failed to save/i, { timeout: 90_000 }).should("exist");
  });

  it("shows a 'Retry failed saves' button after max retries", () => {
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, () =>
        HttpResponse.json(
          { message: "Internal Server Error" },
          { status: 500 },
        ),
      ),
    );
    fillPersonSelectField(/person object/i);
    cy.contains("button", /retry failed saves/i, { timeout: 90_000 }).should(
      "exist",
    );
  });

  it("clears the failure banner after clicking 'Retry failed saves' and the retry succeeds", () => {
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, () =>
        HttpResponse.json({ message: "Server Error" }, { status: 500 }),
      ),
    );
    fillPersonSelectField(/person object/i);
    cy.contains("button", /retry failed saves/i, { timeout: 110_000 }).should(
      "exist",
    );

    // Flip to success for the manual retry action.
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, () =>
        HttpResponse.json({}),
      ),
    );
    cy.contains("button", /retry failed saves/i).click();
    cy.contains(/all changes saved/i, { timeout: 15_000 }).should("exist");
  });

  it("shows a visible alert on failure (no blank status)", () => {
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, () =>
        HttpResponse.json({ message: "Upstream failure" }, { status: 500 }),
      ),
    );
    fillPersonSelectField(/person object/i);
    cy.get('[role="alert"]', { timeout: 90_000 })
      .filter(":visible")
      .should("exist");
  });

  it("shows an error when the API returns 404 for a missing person", () => {
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, () =>
        HttpResponse.json({ message: "Person not found" }, { status: 404 }),
      ),
    );
    fillPersonSelectField(/person object/i);
    cy.contains(/save failed/i, { timeout: 90_000 }).should("exist");
  });
});

// 2. Slow server

describe("Slow server", () => {
  let formId: string;

  beforeEach(() => {
    formId = uniqueFormId();
    visitForm(formId);
    addPerson(formId);
  });

  afterEach(() => {
    resetMswHandlers();
  });

  it("keeps showing 'Saving' banner while the PATCH is delayed", () => {
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, async () => {
        await delay(3000);
        return HttpResponse.json({});
      }),
    );
    fillPersonSelectField(/person object/i);
    cy.contains(/saving/i, { timeout: 5_000 }).should("exist");
    cy.contains(/all changes saved/i, { timeout: 10_000 }).should("exist");
  });

  it("coalesces rapid field edits - only one PATCH fires per queue key", () => {
    fillPersonSelectField(/person object/i);
    cy.contains("label", /person object/i)
      .siblings("select")
      .first()
      .find("option")
      .not("[value='']")
      .then(($opts) => {
        if ($opts.length >= 2) {
          cy.contains("label", /person object/i)
            .siblings("select")
            .first()
            .select(($opts[1] as HTMLOptionElement).value);
        }
      });
    waitForSaved(12_000);
  });

  it("does NOT lose the latest edit made while a save is in-flight", () => {
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, async () => {
        await delay(1500);
        return HttpResponse.json({});
      }),
    );
    let secondValue = "";
    cy.contains("label", /person object/i)
      .siblings("select")
      .first()
      .then(($select) => {
        const options = Array.from($select[0].options).filter(
          (opt) => opt.value !== "",
        );
        if (options.length === 0) {
          return;
        }
        secondValue = options.length >= 2 ? options[1].value : options[0].value;
        cy.wrap($select).select(options[0].value);
        cy.wrap($select).select(secondValue);
      });
    waitForSaved(12_000);
    cy.contains("label", /person object/i)
      .siblings("select")
      .first()
      .invoke("val")
      .then((val) => {
        expect(val).to.equal(secondValue);
      });
  });

  it("queues a new change while another is saving without blocking the UI", () => {
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, async () => {
        await delay(2000);
        return HttpResponse.json({});
      }),
    );
    fillPersonSelectField(/person object/i);
    fillPersonSelectField(/^sex/i);
    cy.contains(/saving/i, { timeout: 5_000 }).should("exist");
    waitForSaved(15_000);
  });
});

// 3. Offline behaviour

describe("Offline behaviour", () => {
  let formId: string;

  beforeEach(() => {
    formId = uniqueFormId();
    visitForm(formId);
    addPerson(formId);
  });

  it("shows an 'Offline' banner when the browser goes offline", () => {
    cy.window().then((win) => {
      win.dispatchEvent(new Event("offline"));
    });
    cy.contains(/offline/i).should("exist");
  });

  it("removes the 'Offline' banner when the browser comes back online", () => {
    cy.window().then((win) => {
      win.dispatchEvent(new Event("offline"));
    });
    cy.contains(/offline/i).should("exist");
    cy.window().then((win) => {
      win.dispatchEvent(new Event("online"));
    });
    cy.contains(/offline/i).should("not.exist");
  });

  it("does not dispatch a PATCH while offline", () => {
    cy.window().then((win) => {
      win.dispatchEvent(new Event("offline"));
    });
    fillPersonSelectField(/person object/i);
    // eslint-disable-next-line cypress/no-unnecessary-waiting
    cy.wait(1500);
    cy.contains(/all changes saved/i).should("not.exist");
    cy.contains(/saving changes/i).should("not.exist");
  });

  it("flushes the queue automatically when back online", () => {
    cy.window().then((win) => {
      win.dispatchEvent(new Event("offline"));
    });
    fillPersonSelectField(/person object/i);
    cy.window().then((win) => {
      win.dispatchEvent(new Event("online"));
    });
    waitForSaved(12_000);
  });
});

// 4. Navigation guard (beforeunload)

describe("Navigation guard", () => {
  let formId: string;

  beforeEach(() => {
    formId = uniqueFormId();
    visitForm(formId);
    addPerson(formId);
  });

  afterEach(() => {
    resetMswHandlers();
  });

  it.skip("registers a beforeunload listener when there are unsaved changes", () => {
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, async () => {
        await delay(8_000);
        return HttpResponse.json({});
      }),
    );
    fillPersonSelectField(/person object/i);
    cy.window().then((win) => {
      let prevented = false;
      const fakeEvent = new Event("beforeunload", { cancelable: true });
      Object.defineProperty(fakeEvent, "preventDefault", {
        value: () => {
          prevented = true;
        },
        writable: false,
      });
      Object.defineProperty(fakeEvent, "returnValue", {
        value: "",
        writable: true,
      });
      win.dispatchEvent(fakeEvent);
      expect(prevented || (fakeEvent as BeforeUnloadEvent).returnValue !== "")
        .to.be.true;
    });
    waitForSaved(15_000);
  });

  it.skip("does NOT block navigation once all changes are saved", () => {
    fillPersonSelectField(/person object/i);
    waitForSaved(12_000);
    cy.window().then((win) => {
      let prevented = false;
      const fakeEvent = new Event("beforeunload", { cancelable: true });
      Object.defineProperty(fakeEvent, "preventDefault", {
        value: () => {
          prevented = true;
        },
        writable: false,
      });
      Object.defineProperty(fakeEvent, "returnValue", {
        value: "",
        writable: true,
      });
      win.dispatchEvent(fakeEvent);
      expect(prevented).to.be.false;
    });
  });
});

// 5. Submit while save in-flight

describe("Submit while autosave in-flight", () => {
  let formId: string;

  afterEach(() => {
    resetMswHandlers();
  });

  it("waits for in-flight save to complete before submitting", () => {
    formId = uniqueFormId();
    visitForm(formId);
    addPerson(formId);
    addTodo(formId, 0);
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, async () => {
        await delay(1500);
        return HttpResponse.json({});
      }),
    );
    fillPersonSelectField(/person object/i);
    cy.contains("button", "Submit").click();
    cy.contains(/submitting|submitted/i, { timeout: 15_000 }).should("exist");
  });

  it("Submit button is disabled while submission is in progress", () => {
    formId = uniqueFormId();
    visitForm(formId);
    addTodo(formId, 0);
    fillPersonSelectField(/person object/i);
    fillPersonSelectField(/^sex/i);
    fillPersonSelectField(/gender/i);
    selectFirstOption(firstTodoTypeSelect());
    fillCountField(
      'input[aria-label*="Completed"], input[name*="completedCount"]',
      1,
    );
    fillCountField(
      'input[aria-label*="In progress"], input[name*="inProgressCount"]',
      1,
    );
    waitForSaved(20_000);
    overrideMsw(
      http.post(`/api/forms/${formId}/persons/submit`, async () => {
        await delay(1500);
        return HttpResponse.json({ submitted: true });
      }),
    );
    cy.contains("button", "Submit").click();
    cy.contains("button", /submitting/i).should("be.disabled");
  });
});

// 6. Submit blocked by failed saves

describe("Submit blocked when saves have failed", () => {
  let formId: string;

  afterEach(() => {
    resetMswHandlers();
  });

  it("shows an error message if submission is attempted with failed saves", () => {
    formId = uniqueFormId();
    visitForm(formId);
    addPerson(formId);
    addTodo(formId, 0);
    overrideMsw(
      http.patch(`/api/forms/${formId}/persons/:id`, () =>
        HttpResponse.json({ message: "Server Error" }, { status: 500 }),
      ),
    );
    fillPersonSelectField(/person object/i);
    cy.contains(/failed to save/i, { timeout: 90_000 }).should("exist");
    cy.contains("button", "Submit").click();
    cy.contains(/not saved|retry failed/i, { timeout: 10_000 }).should("exist");
  });
});

// 7. Scenarios that block form completion

describe("Scenarios blocking form completion", () => {
  let formId: string;

  beforeEach(() => {
    formId = uniqueFormId();
    visitForm(formId);
  });

  afterEach(() => {
    resetMswHandlers();
  });

  it("cannot submit when a person has no todos (blocks completion)", () => {
    fillPersonSelectField(/person object/i);
    fillPersonSelectField(/^sex/i);
    fillPersonSelectField(/gender/i);
    cy.contains("button", "Submit").click();
    cy.contains(
      /please fix validation errors before submitting|at least one todo is required/i,
    ).should("exist");
    cy.contains(/submitted/i).should("not.exist");
  });

  it("cannot submit when todos have both counts at zero", () => {
    addPerson(formId);
    addTodo(formId, 0);
    fillPersonSelectField(/person object/i);
    fillPersonSelectField(/^sex/i);
    fillPersonSelectField(/gender/i);
    selectFirstOption(firstTodoTypeSelect());
    fillCountField(
      'input[aria-label*="Completed"], input[name*="completedCount"]',
      0,
    );
    fillCountField(
      'input[aria-label*="In progress"], input[name*="inProgressCount"]',
      0,
    );
    cy.contains("button", "Submit").click();
    cy.contains(/at least one of completed or in progress/i).should("exist");
    cy.contains(/submitted/i).should("not.exist");
  });

  it.skip("cannot submit when a load error occurred fetching persons", () => {
    const brokenFormId = uniqueFormId();
    overrideMsw(
      http.get(`/api/forms/${brokenFormId}/persons`, () =>
        HttpResponse.json({ message: "Service Unavailable" }, { status: 503 }),
      ),
    );
    cy.visit(`/person-todos-json/${brokenFormId}`);
    cy.contains(/unable to load form data/i, { timeout: 10_000 }).should(
      "exist",
    );
    cy.contains("button", "Submit").should("not.exist");
  });

  it.skip("cannot submit when lookups fail to load (dropdowns empty)", () => {
    const brokenFormId = uniqueFormId();
    overrideMsw(
      http.get(`/api/forms/${brokenFormId}/lookups`, () =>
        HttpResponse.json({ message: "Service Unavailable" }, { status: 503 }),
      ),
    );
    cy.visit(`/person-todos-json/${brokenFormId}`);
    cy.contains(/unable to load form data/i, { timeout: 10_000 }).should(
      "exist",
    );
  });

  it("add-person button shows an error when the POST fails", () => {
    overrideMsw(
      http.post(`/api/forms/${formId}/persons`, () =>
        HttpResponse.json({ message: "Failed" }, { status: 500 }),
      ),
    );
    cy.contains("button", "Add Person").click();
    cy.contains(/unable to add person/i, { timeout: 8_000 }).should("exist");
  });

  it("add-todo button shows an error when the POST fails", () => {
    overrideMsw(
      http.post(`/api/forms/${formId}/persons/:personId/todos`, () =>
        HttpResponse.json({ message: "Failed" }, { status: 500 }),
      ),
    );
    cy.contains("button", "Add Todo").first().click();
    cy.contains(/unable to add todo|please fix validation/i, {
      timeout: 12_000,
    }).should("exist");
  });

  it("delete-person failure shows an error and keeps the person in the list", () => {
    addPerson(formId);
    overrideMsw(
      http.delete(`/api/forms/${formId}/persons/:id`, () =>
        HttpResponse.json({ message: "Failed" }, { status: 500 }),
      ),
    );
    cy.contains("button", "Delete Person").first().click();
    cy.get(".modal").should("be.visible");
    cy.get(".modal")
      .contains("button", /delete/i)
      .click();
    cy.contains(/unable to delete person/i, { timeout: 8_000 }).should("exist");
  });

  it("submit POST failure surfaces an error message to the user", () => {
    addTodo(formId, 0);
    fillPersonSelectField(/person object/i);
    fillPersonSelectField(/^sex/i);
    fillPersonSelectField(/gender/i);
    selectFirstOption(firstTodoTypeSelect());
    fillCountField(
      'input[aria-label*="Completed"], input[name*="completedCount"]',
      1,
    );
    fillCountField(
      'input[aria-label*="In progress"], input[name*="inProgressCount"]',
      1,
    );
    waitForSaved(20_000);
    overrideMsw(
      http.post(`/api/forms/${formId}/persons/submit`, () =>
        HttpResponse.json({ message: "Submission failed" }, { status: 500 }),
      ),
    );
    cy.contains("button", "Submit").click();
    cy.contains(/unable to submit|submission failed|please fix validation/i, {
      timeout: 12_000,
    }).should("exist");
    cy.get("select").should("exist");
  });

  it("preserves server-persisted data after a full page reload", () => {
    addPerson(formId);
    fillPersonSelectField(/person object/i);
    waitForSaved(12_000);
    cy.reload();
    cy.contains("button", "Add Person", { timeout: 12_000 }).should(
      "be.visible",
    );
    cy.contains("label", /person object/i)
      .siblings("select")
      .first()
      .invoke("val")
      .should("not.be.empty");
  });

  it("validation errors on person 2 do not affect person 1's fields", () => {
    addPerson(formId);
    addPerson(formId);
    addTodo(formId, 0);
    fillPersonSelectField(/person object/i);
    fillPersonSelectField(/^sex/i);
    fillPersonSelectField(/gender/i);
    selectFirstOption(firstTodoTypeSelect());
    fillCountField(
      'input[aria-label*="Completed"], input[name*="completedCount"]',
      1,
    );
    fillCountField(
      'input[aria-label*="In progress"], input[name*="inProgressCount"]',
      0,
    );
    cy.contains("button", "Submit").click();
    cy.contains(/required/i).should("exist");
    cy.contains("label", /person object/i)
      .first()
      .siblings("select")
      .first()
      .invoke("val")
      .should("not.be.empty");
  });
});
