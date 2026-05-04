# Person Todo Autosave App

Production-ready React pattern for a PII-sensitive draft autosave form.

## Includes

- React 18 + TypeScript + Vite
- RTK Query for data fetching and mutations
- CoreUI component library
- Yup submit validation
- Full initial GET returning persons + todos
- PATCH sends only the changed field, e.g. `{ "genderId": "man" }`
- Generic list-to-list UI engine via `ListToListManager`
- Person/Todo implementation via `PersonTodoManagerJson` `id` prop
- In-memory autosave queue only — no IndexedDB, localStorage, or sessionStorage for PII
- Debounced autosave with FIFO queue processing
- Retry with exponential backoff (up to 4 attempts: 2 s, 5 s, 15 s, 60 s)
- React StrictMode-safe enqueueing (replay-skip guard prevents duplicate PATCH calls in development)
- Offline detection with queue pause/resume
- Unsaved-changes `beforeunload` warning
- Required-field progress counter
- Accessible validation and save-status messages
- Mock Service Worker backend (MSW)
- Cypress E2E test suite

## Run

```bash
npm install
npm run dev
```

## Test

```bash
# Run all Cypress tests headlessly (requires dev server running on port 5173)
npm run dev &
npx cypress run --headless
```

## Architecture

### Autosave queue (`useAutosaveQueue`)

The generic hook in `src/features/listToList/useAutosaveQueue.ts` drives all save logic:

- Each field change is enqueued with a `queueKey` (e.g. `person:{id}:{field}`).
- Duplicate changes for an in-flight or pending entry are deduplicated before any network call.
- Changes already successfully saved are skipped via `lastSavedChangesRef`.
- A monotonic `enqueueSequenceRef` counter makes enqueue idempotent under React StrictMode's double-invocation of state updater functions.
- On success the item is removed; if re-edited during the save, the item is re-queued as pending.
- On failure the item retries up to `MAX_RETRIES` times with exponential backoff, then moves to `failed` status.
- Failed items can be manually retried via `retryFailed()`.
- `flushQueue()` awaits all pending saves before form submission.

### Domain adapter (`usePersonTodoAutosave`)

`src/features/personTodo/usePersonTodoAutosave.ts` wires the generic queue to person/todo-specific save functions and exposes `enqueuePersonChange` / `enqueueTodoChange`.

### Trace events (dev only)

In development, `emitAutosaveTrace` (in `src/features/listToList/autosaveTrace.ts`) dispatches `person-todo:trace` CustomEvents on `window` for each queue lifecycle step. These are logged to the browser console automatically and can be suppressed at runtime:

```js
localStorage.setItem("personTodoTrace", "off");
```

Trace events are **not emitted in production builds**.

## Mock backend behavior

The mock backend lives in:

```text
src/mocks/handlers.ts
src/mocks/persistedDb.ts
```

It simulates slow requests and occasional failures so you can test retry and backoff behavior. Mock data is persisted per form id in IndexedDB for local development. The MSW worker is exposed on `window.__msw__` so Cypress tests can inject custom handlers without replacing the service worker.

## Component usage

`PersonTodoManagerJson` requires an `id` prop. The id scopes API calls, cache invalidation, and persisted mock data so multiple managers can run side by side.

```tsx
<PersonTodoManagerJson id="default" />
<PersonTodoManagerJson id="team-a" />
<PersonTodoManagerJson id="team-b" />
```

## Routes

- `/` — lists available form ids with links to the editor.
- `/person-todos-json/:id` — opens the JSON-driven manager for a specific form id.

## API shape

Initial load:

```http
GET /api/forms/{formId}/persons
```

Returns full person list including todos.

Lookups:

```http
GET /api/forms/{formId}/lookups
```

Person field PATCH:

```http
PATCH /api/forms/{formId}/persons/{personId}
```

Body:

```json
{
  "genderId": "man"
}
```

Todo field PATCH:

```http
PATCH /api/forms/{formId}/persons/{personId}/todos/{todoId}
```

Body:

```json
{
  "completedCount": 3
}
```

Other operations:

```http
POST   /api/forms/{formId}/persons
DELETE /api/forms/{formId}/persons/{personId}
POST   /api/forms/{formId}/persons/{personId}/todos
DELETE /api/forms/{formId}/persons/{personId}/todos/{todoId}
POST   /api/forms/{formId}/persons/submit
```

The `submit` endpoint requires an `x-idempotency-key` header to prevent duplicate submissions.

## PII note

This sample intentionally uses a short-lived in-memory queue only. Draft values are not persisted in IndexedDB, localStorage, or sessionStorage.
