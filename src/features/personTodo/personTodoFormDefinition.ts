import type { Lookups, PersonRow, TodoRow } from "./types";
import type {
  NumberFieldDefinition,
  SelectFieldDefinition,
} from "../listToList/types";
import rawDefinition from "./personTodoFormDefinition.json";

type PersonFieldKey = Extract<
  keyof PersonRow,
  "personObjectPickId" | "sexId" | "genderId"
>;

type TodoFieldKey = Extract<
  keyof TodoRow,
  "todoTypeId" | "completedCount" | "inProgressCount"
>;

type SelectFieldDef<TKey extends string> = SelectFieldDefinition<
  TKey,
  keyof Lookups
>;

type NumberFieldDef<TKey extends string> = NumberFieldDefinition<TKey>;

type PersonFieldDef = SelectFieldDef<PersonFieldKey>;

type TodoFieldDef = SelectFieldDef<TodoFieldKey> | NumberFieldDef<TodoFieldKey>;

type Definition = {
  schemaVersion: number;
  person: { fields: PersonFieldDef[] };
  todo: { fields: TodoFieldDef[] };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertDefinition(value: unknown): asserts value is Definition {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("Invalid form definition version");
  }

  if (!isRecord(value.person) || !Array.isArray(value.person.fields)) {
    throw new Error("Invalid person field definitions");
  }

  if (!isRecord(value.todo) || !Array.isArray(value.todo.fields)) {
    throw new Error("Invalid todo field definitions");
  }
}

assertDefinition(rawDefinition);

export const personTodoFormDefinition = rawDefinition;
export const personFieldDefinitions = rawDefinition.person.fields;
export const todoFieldDefinitions = rawDefinition.todo.fields;
