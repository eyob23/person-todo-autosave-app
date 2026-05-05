// Generic types for the list-to-list form engine.
// No dependencies on any domain-specific feature.

export type LookupOption = {
  id: string;
  name: string;
  description?: string;
};

export type LookupCollection<TLookupKey extends string = string> = Record<
  TLookupKey,
  LookupOption[]
>;

export type SelectFieldDefinition<
  TKey extends string = string,
  TLookupKey extends string = string,
> = {
  key: TKey;
  label: string;
  tooltip: string;
  type: "select";
  required: boolean;
  lookupKey: TLookupKey;
  placeholder: string;
  columnMd?: number;
};

export type NumberFieldDefinition<TKey extends string = string> = {
  key: TKey;
  label: string;
  tooltip: string;
  type: "number";
  required: boolean;
  min: number;
  triggersPairValidation?: boolean;
  columnMd?: number;
};

export type TextFieldDefinition<TKey extends string = string> = {
  key: TKey;
  label: string;
  tooltip: string;
  type: "text";
  required: boolean;
  placeholder?: string;
  columnMd?: number;
};

export type FieldDefinition<
  TKey extends string = string,
  TLookupKey extends string = string,
> =
  | SelectFieldDefinition<TKey, TLookupKey>
  | NumberFieldDefinition<TKey>
  | TextFieldDefinition<TKey>;

export type QueueItem = {
  queueKey: string;
  status: "pending" | "saving" | "failed";
  retryCount: number;
  lastError?: string;
};

export type RequiredProgress = {
  totalRequired: number;
  completedRequired: number;
  remainingRequired: number;
};
