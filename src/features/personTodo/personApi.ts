import { retry } from "@reduxjs/toolkit/query";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { Lookups, PersonRow, TodoRow } from "./types";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "/api",
  timeout: 10000,
  prepareHeaders: (headers) => {
    headers.set("x-request-id", crypto.randomUUID?.() ?? `${Date.now()}`);
    return headers;
  },
});

const baseQueryWithRetry = retry(rawBaseQuery, {
  maxRetries: 2,
});

export const personApi = createApi({
  reducerPath: "personApi",
  baseQuery: baseQueryWithRetry,
  tagTypes: ["Persons", "Lookups"],
  endpoints: (builder) => ({
    getFormIds: builder.query<string[], void>({
      query: () => ({ url: "/forms" }),
    }),

    getPersons: builder.query<PersonRow[], string>({
      query: (formId) => ({ url: `/forms/${formId}/persons` }),
      providesTags: (_result, _error, formId) => [
        { type: "Persons", id: formId },
      ],
    }),

    getLookups: builder.query<Lookups, string>({
      query: (formId) => ({ url: `/forms/${formId}/lookups` }),
      providesTags: (_result, _error, formId) => [
        { type: "Lookups", id: formId },
      ],
    }),

    updatePersonField: builder.mutation<
      PersonRow,
      {
        formId: string;
        id: string;
        changes: Partial<PersonRow>;
      }
    >({
      query: ({ formId, id, changes }) => ({
        url: `/forms/${formId}/persons/${id}`,
        method: "PATCH",
        body: changes,
      }),
      // Prevent retry middleware from issuing duplicate PATCH requests.
      extraOptions: { maxRetries: 0 },
    }),

    updateTodoField: builder.mutation<
      TodoRow,
      {
        formId: string;
        personId: string;
        todoId: string;
        changes: Partial<TodoRow>;
      }
    >({
      query: ({ formId, personId, todoId, changes }) => ({
        url: `/forms/${formId}/persons/${personId}/todos/${todoId}`,
        method: "PATCH",
        body: changes,
      }),
      // Prevent retry middleware from issuing duplicate PATCH requests.
      extraOptions: { maxRetries: 0 },
    }),

    addPerson: builder.mutation<PersonRow, { formId: string }>({
      query: ({ formId }) => ({
        url: `/forms/${formId}/persons`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { formId }) => [
        { type: "Persons", id: formId },
      ],
    }),

    deletePerson: builder.mutation<
      { ok: boolean },
      { formId: string; id: string }
    >({
      query: ({ formId, id }) => ({
        url: `/forms/${formId}/persons/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { formId }) => [
        { type: "Persons", id: formId },
      ],
    }),

    addTodo: builder.mutation<TodoRow, { formId: string; personId: string }>({
      query: ({ formId, personId }) => ({
        url: `/forms/${formId}/persons/${personId}/todos`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { formId }) => [
        { type: "Persons", id: formId },
      ],
    }),

    deleteTodo: builder.mutation<
      { ok: boolean },
      {
        formId: string;
        personId: string;
        todoId: string;
      }
    >({
      query: ({ formId, personId, todoId }) => ({
        url: `/forms/${formId}/persons/${personId}/todos/${todoId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { formId }) => [
        { type: "Persons", id: formId },
      ],
    }),

    submitPersons: builder.mutation<
      { submitted: boolean; submittedAt: string },
      {
        formId: string;
        persons: PersonRow[];
        idempotencyKey: string;
      }
    >({
      query: ({ formId, persons, idempotencyKey }) => ({
        url: `/forms/${formId}/persons/submit`,
        method: "POST",
        headers: {
          "x-idempotency-key": idempotencyKey,
        },
        body: { persons },
      }),
    }),
  }),
});

export const {
  useGetFormIdsQuery,
  useGetPersonsQuery,
  useGetLookupsQuery,
  useUpdatePersonFieldMutation,
  useUpdateTodoFieldMutation,
  useAddPersonMutation,
  useDeletePersonMutation,
  useAddTodoMutation,
  useDeleteTodoMutation,
  useSubmitPersonsMutation,
} = personApi;
