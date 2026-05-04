import { useCallback } from "react";
import {
  useAutosaveQueue,
  type QueueEntry,
} from "../listToList/useAutosaveQueue";

type PersonTodoPayload =
  | { entityType: "person"; personId: string }
  | { entityType: "todo"; personId: string; todoId: string };

type SavePerson = (
  personId: string,
  changes: Record<string, unknown>,
) => Promise<unknown>;

type SaveTodo = (
  personId: string,
  todoId: string,
  changes: Record<string, unknown>,
) => Promise<unknown>;

type UsePersonTodoAutosaveArgs = {
  isOnline: boolean;
  savePerson: SavePerson;
  saveTodo: SaveTodo;
};

type EnqueuePersonArgs = {
  personId: string;
  field: string;
  value: unknown;
};

type EnqueueTodoArgs = {
  personId: string;
  todoId: string;
  field: string;
  value: unknown;
};

async function dispatchSave(
  entry: QueueEntry<PersonTodoPayload>,
  savePerson: SavePerson,
  saveTodo: SaveTodo,
) {
  if (entry.payload.entityType === "person") {
    await savePerson(entry.payload.personId, entry.changes);
  } else {
    await saveTodo(entry.payload.personId, entry.payload.todoId, entry.changes);
  }
}

export function usePersonTodoAutosave({
  isOnline,
  savePerson,
  saveTodo,
}: UsePersonTodoAutosaveArgs) {
  const saveFn = useCallback(
    (entry: QueueEntry<PersonTodoPayload>) =>
      dispatchSave(entry, savePerson, saveTodo),
    [savePerson, saveTodo],
  );

  const {
    queue,
    queueSummary,
    lastSavedAt,
    enqueue,
    retryFailed,
    clearQueue,
    flushQueue,
  } = useAutosaveQueue<PersonTodoPayload>({
    isOnline,
    saveFn,
    errorEventName: "person-todo:error",
  });

  const enqueuePersonChange = useCallback(
    ({ personId, field, value }: EnqueuePersonArgs) => {
      enqueue({
        queueKey: `person:${personId}:${field}`,
        payload: { entityType: "person", personId },
        changes: { [field]: value },
      });
    },
    [enqueue],
  );

  const enqueueTodoChange = useCallback(
    ({ personId, todoId, field, value }: EnqueueTodoArgs) => {
      enqueue({
        queueKey: `todo:${personId}:${todoId}:${field}`,
        payload: { entityType: "todo", personId, todoId },
        changes: { [field]: value },
      });
    },
    [enqueue],
  );

  return {
    queue,
    queueSummary,
    lastSavedAt,
    enqueuePersonChange,
    enqueueTodoChange,
    retryFailed,
    clearQueue,
    flushQueue,
  };
}
