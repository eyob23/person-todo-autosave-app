import * as yup from "yup";

export const todoSchema = yup.object({
  id: yup.string().required(),
  personId: yup.string().required(),
  todoTypeId: yup.string().required("Todo type is required"),
  completedCount: yup
    .number()
    .typeError("Completed count is required")
    .min(0, "Completed count cannot be negative")
    .required("Completed count is required")
    .test(
      "at-least-one-greater-than-zero",
      "At least one of completed or in progress count must be greater than 0",
      function (value) {
        const { inProgressCount } = this.parent as {
          inProgressCount: number | null;
        };
        return (
          (value != null && value > 0) ||
          (inProgressCount != null && inProgressCount > 0)
        );
      },
    ),
  inProgressCount: yup
    .number()
    .typeError("In progress count is required")
    .min(0, "In progress count cannot be negative")
    .required("In progress count is required")
    .test(
      "at-least-one-greater-than-zero",
      "At least one of completed or in progress count must be greater than 0",
      function (value) {
        const { completedCount } = this.parent as {
          completedCount: number | null;
        };
        return (
          (value != null && value > 0) ||
          (completedCount != null && completedCount > 0)
        );
      },
    ),
});

export const personSchema = yup.object({
  id: yup.string().required(),
  personObjectPickId: yup
    .object({
      id: yup.string().required("Person object id is required"),
      name: yup.string().required("Person object name is required"),
      description: yup.string().optional(),
    })
    .nullable()
    .required("Person object is required"),
  sexId: yup.string().required("Sex is required"),
  genderId: yup.string().required("Gender is required"),
  todos: yup.array().of(todoSchema).min(1, "At least one todo is required"),
});

export const formSchema = yup.object({
  persons: yup
    .array()
    .of(personSchema)
    .min(1, "At least one person is required"),
});
