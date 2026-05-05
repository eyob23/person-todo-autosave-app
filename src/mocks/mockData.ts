import type { Lookups, PersonRow } from "../features/personTodo/types";
import type { LookupOption } from "../features/listToList/types";

const PERSON_OBJECT_PREFIXES = [
  "Employee",
  "Contractor",
  "Visitor",
  "Partner",
  "Vendor",
];

export const personObjectCatalog: LookupOption[] = Array.from(
  { length: 500 },
  (_, index) => {
    const n = index + 1;
    const prefix =
      PERSON_OBJECT_PREFIXES[index % PERSON_OBJECT_PREFIXES.length];
    const padded = String(n).padStart(4, "0");
    return {
      id: `person-object-${padded}`,
      name: `${prefix} ${padded}`,
      description: `${prefix} profile ${padded}`,
    };
  },
);

export const initialPersons: PersonRow[] = [
  {
    id: `person-${Date.now()}`,
    personObjectPickId: null,
    sexId: null,
    genderId: null,
    rowVersion: "1",
    todos: [],
  },
];

export const lookups: Lookups = {
  // Kept for backward compatibility with existing forms.
  personObjects: personObjectCatalog.slice(0, 20),
  sexes: [
    { id: "male", name: "Male", description: "Male sex option" },
    { id: "female", name: "Female", description: "Female sex option" },
    {
      id: "unknown",
      name: "Unknown",
      description: "Sex not known or not specified",
    },
  ],
  genders: [
    { id: "man", name: "Man", description: "Gender identity: man" },
    { id: "woman", name: "Woman", description: "Gender identity: woman" },
    {
      id: "nonbinary",
      name: "Non-binary",
      description: "Gender identity: non-binary",
    },
    {
      id: "prefer-not-to-say",
      name: "Prefer not to say",
      description: "Gender identity intentionally not shared",
    },
  ],
  todoTypes: [
    {
      id: "training",
      name: "Training",
      description: "Training-related todo item",
    },
    {
      id: "review",
      name: "Review",
      description: "Review-related todo item",
    },
    {
      id: "follow-up",
      name: "Follow-up",
      description: "Follow-up todo item",
    },
  ],
};
