import type { PersonRow, RequiredProgress, TodoRow } from "./types";

function hasValue(value: unknown) {
  return value !== null && value !== undefined && value !== "";
}

export function isTodoComplete(todo: TodoRow): boolean {
  return (
    hasValue(todo.todoTypeId) &&
    hasValue(todo.completedCount) &&
    hasValue(todo.inProgressCount) &&
    ((todo.completedCount != null && todo.completedCount > 0) ||
      (todo.inProgressCount != null && todo.inProgressCount > 0))
  );
}

export function getRequiredFieldProgress(
  persons: PersonRow[],
): RequiredProgress {
  let totalRequired = 0;
  let completedRequired = 0;

  persons.forEach((person) => {
    const personFields = [
      person.personObjectPickId,
      person.sexId,
      person.genderId,
    ];

    personFields.forEach((value) => {
      totalRequired++;
      if (hasValue(value)) completedRequired++;
    });

    if (!person.todos || person.todos.length === 0) {
      totalRequired++;
      return;
    }

    person.todos.forEach((todo) => {
      const todoFields = [
        todo.todoTypeId,
        todo.completedCount,
        todo.inProgressCount,
      ];

      todoFields.forEach((value) => {
        totalRequired++;
        if (hasValue(value)) completedRequired++;
      });

      // Cross-field rule: at least one count must be > 0
      totalRequired++;
      const completedFilled =
        hasValue(todo.completedCount) && (todo.completedCount as number) > 0;
      const inProgressFilled =
        hasValue(todo.inProgressCount) && (todo.inProgressCount as number) > 0;
      if (completedFilled || inProgressFilled) completedRequired++;
    });
  });

  return {
    totalRequired,
    completedRequired,
    remainingRequired: totalRequired - completedRequired,
  };
}

export function getPersonRequiredFieldProgress(
  person: PersonRow,
): RequiredProgress {
  return getRequiredFieldProgress([person]);
}
