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
    { id: "male", name: "Male" },
    { id: "female", name: "Female" },
    { id: "unknown", name: "Unknown" },
  ],
  genders: [
    { id: "man", name: "Man" },
    { id: "woman", name: "Woman" },
    { id: "nonbinary", name: "Non-binary" },
    { id: "prefer-not-to-say", name: "Prefer not to say" },
  ],
  todoTypes: [
    { id: "training", name: "Training" },
    { id: "review", name: "Review" },
    { id: "follow-up", name: "Follow-up" },
  ],
};
