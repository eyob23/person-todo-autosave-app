import { CFormInput, CFormSelect } from "@coreui/react";
import { useEffect, useRef } from "react";
import {
  useController,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import { FieldSaveStatus } from "./FieldSaveStatus";
import { emitAutosaveTrace } from "./autosaveTrace";
import type {
  LookupCollection,
  NumberFieldDefinition,
  QueueItem,
  SelectFieldDefinition,
  TextFieldDefinition,
} from "./types";

export function toNullableString(value: string) {
  return value === "" ? null : value;
}

export function toNullableNumber(value: string) {
  return value === "" ? null : Number(value);
}

function useAutosaveEmissionGuard(currentValue: unknown) {
  const lastEmittedValueRef = useRef(currentValue);

  useEffect(() => {
    lastEmittedValueRef.current = currentValue;
  }, [currentValue]);

  return (nextValue: unknown) => {
    if (Object.is(lastEmittedValueRef.current, nextValue)) {
      return false;
    }

    lastEmittedValueRef.current = nextValue;
    return true;
  };
}

type CommonFieldProps<TFieldValues extends FieldValues = FieldValues> = {
  control: Control<TFieldValues>;
  name: Path<TFieldValues>;
  inputId: string;
  ariaLabel: string;
  queueKey: string;
  queue: QueueItem[];
  submitAttempted: boolean;
  onAutosave: (value: unknown) => void;
};

type FormSelectFieldProps<TFieldValues extends FieldValues = FieldValues> =
  CommonFieldProps<TFieldValues> & {
    fieldDef: SelectFieldDefinition;
    lookups?: LookupCollection;
  };

export function FormSelectField<
  TFieldValues extends FieldValues = FieldValues,
>({
  control,
  name,
  inputId,
  ariaLabel,
  queueKey,
  queue,
  submitAttempted,
  onAutosave,
  fieldDef,
  lookups,
}: FormSelectFieldProps<TFieldValues>) {
  const { field, fieldState } = useController({ control, name });
  const errorId = `${inputId}-error`;
  const shouldEmitAutosave = useAutosaveEmissionGuard(field.value);

  return (
    <>
      <CFormSelect
        id={inputId}
        aria-label={ariaLabel}
        aria-required={fieldDef.required ? "true" : undefined}
        aria-describedby={
          submitAttempted && fieldState.error ? errorId : undefined
        }
        name={field.name}
        onBlur={field.onBlur}
        ref={field.ref}
        value={(field.value as string | number | null) ?? ""}
        onChange={(e) => {
          const nextValue = toNullableString(e.target.value);
          field.onChange(nextValue);
          const emitted = shouldEmitAutosave(nextValue);
          emitAutosaveTrace("field:select:onChange", {
            queueKey,
            fieldName: field.name,
            nextValue,
            emitted,
          });
          if (emitted) {
            onAutosave(nextValue);
          }
        }}
        invalid={submitAttempted && !!fieldState.error}
      >
        <option value="">{fieldDef.placeholder}</option>
        {(lookups?.[fieldDef.lookupKey] ?? []).map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </CFormSelect>
      <FieldSaveStatus queueKey={queueKey} queue={queue} />
      {submitAttempted && fieldState.error && (
        <div id={errorId} className="text-danger small mt-1" role="alert">
          {fieldState.error.message}
        </div>
      )}
    </>
  );
}

type FormNumberFieldProps<TFieldValues extends FieldValues = FieldValues> =
  CommonFieldProps<TFieldValues> & {
    fieldDef: NumberFieldDefinition;
    onChangeValidate?: () => void;
  };

export function FormNumberField<
  TFieldValues extends FieldValues = FieldValues,
>({
  control,
  name,
  inputId,
  ariaLabel,
  queueKey,
  queue,
  submitAttempted,
  onAutosave,
  fieldDef,
  onChangeValidate,
}: FormNumberFieldProps<TFieldValues>) {
  const { field, fieldState } = useController({ control, name });
  const errorId = `${inputId}-error`;
  const shouldEmitAutosave = useAutosaveEmissionGuard(field.value);

  return (
    <>
      <CFormInput
        id={inputId}
        aria-label={ariaLabel}
        aria-required={fieldDef.required ? "true" : undefined}
        aria-describedby={
          submitAttempted && fieldState.error ? errorId : undefined
        }
        name={field.name}
        onBlur={field.onBlur}
        ref={field.ref}
        type="number"
        min={fieldDef.min}
        value={(field.value as string | number | null) ?? ""}
        onChange={(e) => {
          const nextValue = toNullableNumber(e.target.value);
          field.onChange(nextValue);
          onChangeValidate?.();
          const emitted = shouldEmitAutosave(nextValue);
          emitAutosaveTrace("field:number:onChange", {
            queueKey,
            fieldName: field.name,
            nextValue,
            emitted,
          });
          if (emitted) {
            onAutosave(nextValue);
          }
        }}
        invalid={submitAttempted && !!fieldState.error}
      />
      <FieldSaveStatus queueKey={queueKey} queue={queue} />
      {submitAttempted && fieldState.error && (
        <div id={errorId} className="text-danger small mt-1" role="alert">
          {fieldState.error.message}
        </div>
      )}
    </>
  );
}

type FormTextFieldProps<TFieldValues extends FieldValues = FieldValues> =
  CommonFieldProps<TFieldValues> & {
    fieldDef: TextFieldDefinition;
  };

export function FormTextField<TFieldValues extends FieldValues = FieldValues>({
  control,
  name,
  inputId,
  ariaLabel,
  queueKey,
  queue,
  submitAttempted,
  onAutosave,
  fieldDef,
}: FormTextFieldProps<TFieldValues>) {
  const { field, fieldState } = useController({ control, name });
  const errorId = `${inputId}-error`;
  const shouldEmitAutosave = useAutosaveEmissionGuard(field.value);

  return (
    <>
      <CFormInput
        id={inputId}
        aria-label={ariaLabel}
        aria-required={fieldDef.required ? "true" : undefined}
        aria-describedby={
          submitAttempted && fieldState.error ? errorId : undefined
        }
        name={field.name}
        onBlur={field.onBlur}
        ref={field.ref}
        type="text"
        value={(field.value as string | number | null) ?? ""}
        placeholder={fieldDef.placeholder ?? ""}
        onChange={(e) => {
          const nextValue = toNullableString(e.target.value);
          field.onChange(nextValue);
          const emitted = shouldEmitAutosave(nextValue);
          emitAutosaveTrace("field:text:onChange", {
            queueKey,
            fieldName: field.name,
            nextValue,
            emitted,
          });
          if (emitted) {
            onAutosave(nextValue);
          }
        }}
        invalid={submitAttempted && !!fieldState.error}
      />
      <FieldSaveStatus queueKey={queueKey} queue={queue} />
      {submitAttempted && fieldState.error && (
        <div id={errorId} className="text-danger small mt-1" role="alert">
          {fieldState.error.message}
        </div>
      )}
    </>
  );
}
