import { delay, http, HttpResponse } from "msw";
import type { PersonRow, TodoRow } from "../features/personTodo/types";
import { lookups, personObjectCatalog } from "./mockData";
import {
  getPersistedFormIds,
  getPersistedPersons,
  setPersistedPersons,
} from "./persistedDb";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function bumpVersion(version?: string): string {
  const current = Number(version ?? "0");
  return String(current + 1);
}

function notFound(message: string) {
  return HttpResponse.json({ message }, { status: 404 });
}

export const handlers = [
  http.get("/api/forms", async () => {
    await delay(100);
    const formIds = await getPersistedFormIds();
    return HttpResponse.json(formIds);
  }),

  http.get("/api/forms/:formId/persons", async ({ params }) => {
    await delay(150);
    const formId = String(params.formId);
    const persons = await getPersistedPersons(formId);
    return HttpResponse.json(persons);
  }),

  http.get("/api/forms/:formId/lookups", async () => {
    await delay(50);
    return HttpResponse.json(clone(lookups));
  }),

  http.get("/api/forms/:formId/person-objects", async ({ request }) => {
    await delay(120);
    const url = new URL(request.url);
    const query = url.searchParams.get("query")?.trim().toLowerCase() ?? "";

    const filtered = query
      ? personObjectCatalog.filter(
          (option) =>
            option.name.toLowerCase().includes(query) ||
            option.id.toLowerCase().includes(query) ||
            option.description?.toLowerCase().includes(query),
        )
      : personObjectCatalog;

    return HttpResponse.json(filtered.slice(0, 50));
  }),

  http.post("/api/forms/:formId/persons", async ({ params }) => {
    await delay(150);
    const formId = String(params.formId);
    const persons = await getPersistedPersons(formId);

    const newPerson: PersonRow = {
      id: `person-${Date.now()}`,
      personObjectPickId: null,
      sexId: null,
      genderId: null,
      rowVersion: "1",
      todos: [],
    };

    persons.push(newPerson);
    await setPersistedPersons(formId, persons);
    return HttpResponse.json(newPerson, { status: 201 });
  }),

  http.patch(
    "/api/forms/:formId/persons/:personId",
    async ({ params, request }) => {
      await delay(150);
      const formId = String(params.formId);
      const personId = String(params.personId);
      const changes = (await request.json()) as Partial<PersonRow>;
      const persons = await getPersistedPersons(formId);

      const personIndex = persons.findIndex((person) => person.id === personId);
      if (personIndex < 0) {
        return notFound("Person not found");
      }

      persons[personIndex] = {
        ...persons[personIndex],
        ...changes,
        rowVersion: bumpVersion(persons[personIndex].rowVersion),
      };

      await setPersistedPersons(formId, persons);
      return HttpResponse.json(persons[personIndex]);
    },
  ),

  http.delete("/api/forms/:formId/persons/:personId", async ({ params }) => {
    await delay(100);
    const formId = String(params.formId);
    const personId = String(params.personId);
    const persons = await getPersistedPersons(formId);
    const nextPersons = persons.filter((person) => person.id !== personId);

    await setPersistedPersons(formId, nextPersons);
    return HttpResponse.json({ ok: true });
  }),

  http.post(
    "/api/forms/:formId/persons/:personId/todos",
    async ({ params }) => {
      await delay(150);
      const formId = String(params.formId);
      const personId = String(params.personId);
      const persons = await getPersistedPersons(formId);
      const person = persons.find((item) => item.id === personId);

      if (!person) {
        return notFound("Person not found");
      }

      const todo: TodoRow = {
        id: `todo-${Date.now()}`,
        personId,
        todoTypeId: null,
        completedCount: null,
        inProgressCount: null,
        rowVersion: "1",
      };

      person.todos.push(todo);
      await setPersistedPersons(formId, persons);
      return HttpResponse.json(todo, { status: 201 });
    },
  ),

  http.patch(
    "/api/forms/:formId/persons/:personId/todos/:todoId",
    async ({ params, request }) => {
      await delay(150);
      const formId = String(params.formId);
      const personId = String(params.personId);
      const todoId = String(params.todoId);
      const changes = (await request.json()) as Partial<TodoRow>;
      const persons = await getPersistedPersons(formId);
      const person = persons.find((item) => item.id === personId);

      if (!person) {
        return notFound("Person not found");
      }

      const todoIndex = person.todos.findIndex((todo) => todo.id === todoId);
      if (todoIndex < 0) {
        return notFound("Todo not found");
      }

      person.todos[todoIndex] = {
        ...person.todos[todoIndex],
        ...changes,
        rowVersion: bumpVersion(person.todos[todoIndex].rowVersion),
      };

      await setPersistedPersons(formId, persons);
      return HttpResponse.json(person.todos[todoIndex]);
    },
  ),

  http.delete(
    "/api/forms/:formId/persons/:personId/todos/:todoId",
    async ({ params }) => {
      await delay(100);
      const formId = String(params.formId);
      const personId = String(params.personId);
      const todoId = String(params.todoId);
      const persons = await getPersistedPersons(formId);
      const person = persons.find((item) => item.id === personId);

      if (!person) {
        return notFound("Person not found");
      }

      person.todos = person.todos.filter((todo) => todo.id !== todoId);
      await setPersistedPersons(formId, persons);
      return HttpResponse.json({ ok: true });
    },
  ),

  http.post("/api/forms/:formId/persons/submit", async () => {
    await delay(250);
    return HttpResponse.json({
      submitted: true,
      submittedAt: new Date().toISOString(),
    });
  }),
];
