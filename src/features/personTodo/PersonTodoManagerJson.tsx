import { useCallback } from "react";
import {
  useAddPersonMutation,
  useAddTodoMutation,
  useDeletePersonMutation,
  useDeleteTodoMutation,
  useGetLookupsQuery,
  useGetPersonsQuery,
  useSubmitPersonsMutation,
  useUpdatePersonFieldMutation,
  useUpdateTodoFieldMutation,
} from "./personApi";
import {
  formatUserErrorMessage,
  logApiError,
  normalizeApiError,
} from "./errorHandling";
import {
  ListToListManager,
  type ListToListChangeValidationContext,
} from "../listToList/NestedListManager";
import {
  getPersonRequiredFieldProgress,
  isTodoComplete,
} from "./requiredProgress";
import {
  personFieldDefinitions,
  todoFieldDefinitions,
} from "./personTodoFormDefinition";
import type { PersonRow, TodoRow } from "./types";
import { usePersonTodoAutosave } from "./usePersonTodoAutosave";
import { useOnlineStatus } from "../listToList/useOnlineStatus";
import { formSchema } from "./validation";

type Props = {
  id: string;
};

function createIdempotencyKey() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export default function PersonTodoManagerJson({ id }: Props) {
  const personsQuery = useGetPersonsQuery(id);
  const lookupsQuery = useGetLookupsQuery(id);

  const { data: persons = [], isLoading, error } = personsQuery;
  const {
    data: lookups,
    isLoading: isLookupsLoading,
    error: lookupsError,
  } = lookupsQuery;

  const isInitialDataResolved =
    (personsQuery.isSuccess || personsQuery.isError) &&
    (lookupsQuery.isSuccess || lookupsQuery.isError);

  const [updatePersonField] = useUpdatePersonFieldMutation();
  const [updateTodoField] = useUpdateTodoFieldMutation();
  const [addPerson] = useAddPersonMutation();
  const [deletePerson] = useDeletePersonMutation();
  const [addTodo] = useAddTodoMutation();
  const [deleteTodo] = useDeleteTodoMutation();
  const [submitPersons] = useSubmitPersonsMutation();

  const isOnline = useOnlineStatus();

  const savePerson = useCallback(
    async (personId: string, changes: Record<string, unknown>) => {
      await updatePersonField({
        formId: id,
        id: personId,
        changes: changes as Partial<PersonRow>,
      }).unwrap();
    },
    [id, updatePersonField],
  );

  const saveTodo = useCallback(
    async (
      personId: string,
      todoId: string,
      changes: Record<string, unknown>,
    ) => {
      await updateTodoField({
        formId: id,
        personId,
        todoId,
        changes: changes as Partial<TodoRow>,
      }).unwrap();
    },
    [id, updateTodoField],
  );

  const {
    queue,
    queueSummary,
    lastSavedAt,
    enqueuePersonChange,
    enqueueTodoChange,
    retryFailed,
    flushQueue,
  } = usePersonTodoAutosave({ isOnline, savePerson, saveTodo });

  const handleParentAutosave = useCallback(
    (personId: string, field: string, value: unknown) => {
      enqueuePersonChange({ personId, field, value });
    },
    [enqueuePersonChange],
  );

  const handleChildAutosave = useCallback(
    (personId: string, todoId: string, field: string, value: unknown) => {
      enqueueTodoChange({ personId, todoId, field, value });
    },
    [enqueueTodoChange],
  );

  const handleCountsValidation = useCallback(
    ({
      parentIndex,
      childIndex,
      trigger,
      parentKey,
      childKey,
    }: ListToListChangeValidationContext) => {
      void trigger([
        `${parentKey}.${parentIndex}.${childKey}.${childIndex}.completedCount`,
        `${parentKey}.${parentIndex}.${childKey}.${childIndex}.inProgressCount`,
      ]);
    },
    [],
  );

  const handleSubmitAll = useCallback(
    async (_formId: string, nextPersons: PersonRow[]) => {
      const idempotencyKey = createIdempotencyKey();

      try {
        await flushQueue();
        await submitPersons({
          formId: id,
          persons: nextPersons,
          idempotencyKey,
        }).unwrap();
      } catch (err) {
        const normalized = normalizeApiError(
          err,
          "Unable to submit. Please make sure all changes are saved.",
        );

        logApiError("submit", normalized, {
          formId: id,
          idempotencyKey,
          personsCount: nextPersons.length,
        });

        const message = normalized.requestId
          ? formatUserErrorMessage(normalized)
          : `${normalized.userMessage} (Ref: ${idempotencyKey})`;

        throw new Error(message);
      }
    },
    [flushQueue, id, submitPersons],
  );

  return (
    <ListToListManager<PersonRow, TodoRow>
      formId={id}
      title="Person Todo JSON-Driven Form"
      privacyNotice="Draft values are autosaved in short-lived memory only. No PII is stored in IndexedDB, localStorage, or sessionStorage."
      introText="Fields are rendered from a JSON definition. Autosave and mutations are fully wired."
      parentLabel="Person"
      parentPluralLabel="Persons"
      childLabel="Todo"
      childPluralLabel="Todos"
      parentKey="persons"
      childKey="todos"
      parentEntityQueueKey="person"
      childEntityQueueKey="todo"
      parentFieldDefinitions={personFieldDefinitions}
      childFieldDefinitions={todoFieldDefinitions}
      validationSchema={formSchema}
      lookups={lookups}
      initialParents={persons}
      isInitialDataResolved={isInitialDataResolved}
      isLoading={isLoading}
      isLookupsLoading={isLookupsLoading}
      loadError={error}
      lookupsError={lookupsError}
      isOnline={isOnline}
      queue={queue}
      queueSummary={queueSummary}
      lastSavedAt={lastSavedAt}
      onRetryFailed={retryFailed}
      onCreateParent={(formId) => addPerson({ formId }).unwrap()}
      onDeleteParent={async (formId, parentId) => {
        await deletePerson({ formId, id: parentId }).unwrap();
      }}
      onCreateChild={(formId, parentId) =>
        addTodo({ formId, personId: parentId }).unwrap()
      }
      onDeleteChild={async (formId, parentId, childId) => {
        await deleteTodo({
          formId,
          personId: parentId,
          todoId: childId,
        }).unwrap();
      }}
      onParentFieldAutosave={handleParentAutosave}
      onChildFieldAutosave={handleChildAutosave}
      onChildFieldChangeValidate={handleCountsValidation}
      getParentProgress={getPersonRequiredFieldProgress}
      isChildComplete={isTodoComplete}
      onSubmitAll={handleSubmitAll}
    />
  );
}
