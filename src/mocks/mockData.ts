import type { Lookups, PersonRow } from "../features/personTodo/types";

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
  personObjects: [
    { id: "employee", name: "Employee" },
    { id: "contractor", name: "Contractor" },
    { id: "visitor", name: "Visitor" },
  ],
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
