export type { LookupOption, RequiredProgress } from "../listToList/types";
import type { LookupOption } from "../listToList/types";

export type PersonObjectSelection = {
  id: string;
  name: string;
  description?: string;
};

export type TodoRow = {
  id: string;
  personId: string;
  todoTypeId: string | null;
  completedCount: number | null;
  inProgressCount: number | null;
  rowVersion?: string;
};

export type PersonRow = {
  id: string;
  personObjectPickId: PersonObjectSelection | null;
  sexId: string | null;
  genderId: string | null;
  rowVersion?: string;
  todos: TodoRow[];
};

export type Lookups = {
  personObjects: LookupOption[];
  sexes: LookupOption[];
  genders: LookupOption[];
  todoTypes: LookupOption[];
};

export type PendingChange = {
  id: string;
  queueKey: string;
  entityType: "person" | "todo";
  personId: string;
  todoId?: string;
  changes: Record<string, unknown>;
  status: "pending" | "saving" | "failed";
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};
