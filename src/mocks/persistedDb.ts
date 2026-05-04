import type { PersonRow } from "../features/personTodo/types";
import { initialPersons } from "./mockData";

type PersistedState = {
  forms: Record<string, PersonRow[]>;
};

type LegacyPersistedState = {
  persons: PersonRow[];
};

const DB_NAME = "person-todo-autosave-msw";
const STORE_NAME = "mock-store";
const STATE_KEY = "person-todo-state-v1";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open indexedDB"));
    };
  });
}

async function readRawState(): Promise<
  PersistedState | LegacyPersistedState | undefined
> {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(STATE_KEY);

    request.onsuccess = () => {
      resolve(
        request.result as PersistedState | LegacyPersistedState | undefined,
      );
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to read mock state"));
    };
  });
}

function normalizeState(
  state: PersistedState | LegacyPersistedState | undefined,
): PersistedState | undefined {
  if (!state) {
    return undefined;
  }

  if ("forms" in state && state.forms) {
    return {
      forms: clone(state.forms),
    };
  }

  if ("persons" in state && Array.isArray(state.persons)) {
    return {
      forms: {
        default: clone(state.persons),
      },
    };
  }

  return undefined;
}

async function writeRawState(state: PersistedState): Promise<void> {
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);

    transaction.oncomplete = () => {
      resolve();
    };

    transaction.onerror = () => {
      reject(transaction.error ?? new Error("Failed to persist mock state"));
    };

    store.put(clone(state), STATE_KEY);
  });
}

export async function getPersistedPersons(
  formId: string,
): Promise<PersonRow[]> {
  const rawState = await readRawState();
  const state = normalizeState(rawState);

  if (!state) {
    const seeded = { forms: { default: clone(initialPersons) } };
    await writeRawState(seeded);
    if (formId === "default") {
      return seeded.forms.default;
    }

    return clone(initialPersons);
  }

  if (!rawState || !("forms" in rawState)) {
    await writeRawState(state);
  }

  const persons = state.forms[formId] ?? clone(initialPersons);
  return clone(persons);
}

export async function setPersistedPersons(
  formId: string,
  persons: PersonRow[],
): Promise<void> {
  const state = normalizeState(await readRawState()) ?? {
    forms: { default: clone(initialPersons) },
  };
  const nextState: PersistedState = {
    forms: {
      ...state.forms,
      [formId]: clone(persons),
    },
  };

  await writeRawState(nextState);
}

export async function getPersistedFormIds(): Promise<string[]> {
  const rawState = await readRawState();
  const state = normalizeState(rawState);

  if (!state) {
    const seeded = { forms: { default: clone(initialPersons) } };
    await writeRawState(seeded);
    return ["default"];
  }

  if (!rawState || !("forms" in rawState)) {
    await writeRawState(state);
  }

  const formIds = Object.keys(state.forms);
  if (formIds.length === 0) {
    return ["default"];
  }

  return formIds.sort((a, b) => a.localeCompare(b));
}
