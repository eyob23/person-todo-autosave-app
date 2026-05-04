import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import {
  CAlert,
  CButton,
  CCard,
  CCardBody,
  CCardFooter,
  CCardHeader,
  CCol,
  CContainer,
  CFormLabel,
  CModal,
  CModalBody,
  CModalFooter,
  CModalHeader,
  CModalTitle,
  CRow,
  CSpinner,
  CTooltip,
} from "@coreui/react";
import { yupResolver } from "@hookform/resolvers/yup";
import {
  useFieldArray,
  useForm,
  useFormState,
  useWatch,
  type Control,
  type UseFormTrigger,
} from "react-hook-form";
import { FormNumberField, FormSelectField, FormTextField } from "./FormFields";
import { GlobalSaveStatus } from "./GlobalSaveStatus";
import { RequiredCounter } from "./RequiredCounter";
import type {
  FieldDefinition,
  LookupCollection,
  QueueItem,
  RequiredProgress,
} from "./types";

type ListToListChangeValidationContext = {
  parentIndex: number;
  childIndex: number;
  fieldKey: string;
  trigger: UseFormTrigger<any>;
  parentKey: string;
  childKey: string;
};

type ListToListManagerProps<
  TParent extends { id: string } & Record<string, unknown>,
  TChild extends { id: string } & Record<string, unknown>,
> = {
  formId: string;
  title: string;
  introText?: string;
  privacyNotice?: string;
  parentLabel: string;
  parentPluralLabel: string;
  childLabel: string;
  childPluralLabel: string;
  parentKey: string;
  childKey: string;
  parentEntityQueueKey: string;
  childEntityQueueKey: string;
  parentFieldDefinitions: FieldDefinition[];
  childFieldDefinitions: FieldDefinition[];
  validationSchema: unknown;
  lookups?: LookupCollection;
  initialParents: TParent[];
  isInitialDataResolved: boolean;
  isLoading: boolean;
  isLookupsLoading?: boolean;
  loadError?: unknown;
  lookupsError?: unknown;
  isOnline: boolean;
  queue: QueueItem[];
  queueSummary: { pending: number; saving: number; failed: number };
  lastSavedAt: string | null;
  onRetryFailed: () => void;
  onCreateParent: (formId: string) => Promise<TParent>;
  onDeleteParent: (formId: string, parentId: string) => Promise<void>;
  onCreateChild: (formId: string, parentId: string) => Promise<TChild>;
  onDeleteChild: (
    formId: string,
    parentId: string,
    childId: string,
  ) => Promise<void>;
  onParentFieldAutosave: (
    parentId: string,
    field: string,
    value: unknown,
  ) => void;
  onChildFieldAutosave: (
    parentId: string,
    childId: string,
    field: string,
    value: unknown,
  ) => void;
  onChildFieldChangeValidate?: (
    context: ListToListChangeValidationContext,
  ) => void;
  getParentProgress: (parent: TParent) => RequiredProgress;
  isChildComplete: (child: TChild) => boolean;
  onSubmitAll: (formId: string, parents: TParent[]) => Promise<void>;
};

type DeleteTarget = {
  parentId: string;
};

function focusElementById(id: string, attempts = 5) {
  let remaining = attempts;

  const tryFocus = () => {
    const element = document.getElementById(id) as HTMLElement | null;
    if (element) {
      element.focus();
      return;
    }

    remaining -= 1;
    if (remaining > 0) {
      window.requestAnimationFrame(tryFocus);
    }
  };

  window.requestAnimationFrame(tryFocus);
}

function getParentQueueSignature(queue: QueueItem[], parentId: string) {
  if (!parentId) return "";
  return queue
    .filter((item) => item.queueKey.includes(`:${parentId}:`))
    .map(
      (item) =>
        `${item.queueKey}:${item.status}:${item.retryCount}:${item.lastError ?? ""}`,
    )
    .join("|");
}

function RequiredLabel({
  label,
  tooltip,
  required,
}: {
  label: string;
  tooltip: string;
  required: boolean;
}) {
  return (
    <>
      {label}{" "}
      {required && (
        <span className="text-danger" aria-hidden="true">
          *
        </span>
      )}{" "}
      <CTooltip content={tooltip} placement="top">
        <span
          className="text-muted"
          style={{ cursor: "help", fontSize: "0.8em" }}
          aria-label={`Information: ${tooltip}`}
          tabIndex={0}
        >
          &#9432;
        </span>
      </CTooltip>
    </>
  );
}

const OverallRequiredCounter = memo(function OverallRequiredCounter({
  control,
  parentKey,
  getParentProgress,
}: {
  control: Control<any>;
  parentKey: string;
  getParentProgress: (parent: any) => RequiredProgress;
}) {
  const parents = useWatch({ control, name: parentKey as never }) ?? [];
  const totalProgress = useMemo(() => {
    return (parents as any[]).reduce<RequiredProgress>(
      (acc, parent) => {
        const progress = getParentProgress(parent);
        return {
          totalRequired: acc.totalRequired + progress.totalRequired,
          completedRequired: acc.completedRequired + progress.completedRequired,
          remainingRequired: acc.remainingRequired + progress.remainingRequired,
        };
      },
      { totalRequired: 0, completedRequired: 0, remainingRequired: 0 },
    );
  }, [getParentProgress, parents]);

  return (
    <RequiredCounter progress={totalProgress} label="Overall required fields" />
  );
});

const OverallCounts = memo(function OverallCounts({
  control,
  parentKey,
  childKey,
  parentPluralLabel,
  childPluralLabel,
}: {
  control: Control<any>;
  parentKey: string;
  childKey: string;
  parentPluralLabel: string;
  childPluralLabel: string;
}) {
  const parents = (useWatch({ control, name: parentKey as never }) ??
    []) as Array<Record<string, unknown>>;
  const totalParentsCount = parents.length;
  const totalChildrenCount = useMemo(
    () =>
      parents.reduce((sum, parent) => {
        const children = (parent[childKey] as unknown[]) ?? [];
        return sum + children.length;
      }, 0),
    [childKey, parents],
  );

  return (
    <div className="small fw-semibold text-muted">
      Overall count: {parentPluralLabel} {totalParentsCount} |{" "}
      {childPluralLabel} {totalChildrenCount}
    </div>
  );
});

const ParentsRootError = memo(function ParentsRootError({
  control,
  parentKey,
}: {
  control: Control<any>;
  parentKey: string;
}) {
  const { errors } = useFormState({ control, name: parentKey as never });
  const root = (errors as Record<string, unknown>)[parentKey] as
    | { message?: string }
    | undefined;

  if (!root?.message) {
    return null;
  }

  return (
    <CAlert color="danger" role="alert">
      {root.message}
    </CAlert>
  );
});

type ListChildRowProps = {
  parentIndex: number;
  childIndex: number;
  fieldKey: string;
  childKeyId: string;
  parentId: string;
  parentLabel: string;
  childLabel: string;
  parentKey: string;
  childKey: string;
  childEntityQueueKey: string;
  control: Control<any>;
  lookups?: LookupCollection;
  queue: QueueItem[];
  submitAttempted: boolean;
  childFieldDefinitions: FieldDefinition[];
  onChildFieldAutosave: (
    parentId: string,
    childId: string,
    field: string,
    value: unknown,
  ) => void;
  onChildFieldChangeValidate?: (
    context: ListToListChangeValidationContext,
  ) => void;
  onRequestDeleteChild: (parentId: string, childId: string) => void;
  trigger: UseFormTrigger<any>;
};

function areListChildRowPropsEqual(
  prev: ListChildRowProps,
  next: ListChildRowProps,
) {
  if (
    prev.parentIndex !== next.parentIndex ||
    prev.childIndex !== next.childIndex ||
    prev.fieldKey !== next.fieldKey ||
    prev.childKeyId !== next.childKeyId ||
    prev.parentId !== next.parentId ||
    prev.control !== next.control ||
    prev.lookups !== next.lookups ||
    prev.submitAttempted !== next.submitAttempted ||
    prev.childFieldDefinitions !== next.childFieldDefinitions ||
    prev.onChildFieldAutosave !== next.onChildFieldAutosave ||
    prev.onChildFieldChangeValidate !== next.onChildFieldChangeValidate ||
    prev.onRequestDeleteChild !== next.onRequestDeleteChild ||
    prev.parentKey !== next.parentKey ||
    prev.childKey !== next.childKey ||
    prev.trigger !== next.trigger
  ) {
    return false;
  }
  return (
    getParentQueueSignature(prev.queue, prev.parentId) ===
    getParentQueueSignature(next.queue, next.parentId)
  );
}

const ListChildRow = memo(function ListChildRow({
  parentIndex,
  childIndex,
  fieldKey,
  childKeyId,
  parentId,
  parentLabel,
  childLabel,
  parentKey,
  childKey,
  childEntityQueueKey,
  control,
  lookups,
  queue,
  submitAttempted,
  childFieldDefinitions,
  onChildFieldAutosave,
  onChildFieldChangeValidate,
  onRequestDeleteChild,
  trigger,
}: ListChildRowProps) {
  const child = useWatch({
    control,
    name: `${parentKey}.${parentIndex}.${childKey}.${childIndex}` as never,
  }) as { id?: string } | undefined;
  // useWatch can briefly return undefined right after append; fall back to
  // field-array snapshot id so first edit still autosaves.
  const childId = child?.id ?? childKeyId;
  const childFieldKey = childId || `p${parentIndex}-c${childIndex}`;
  const childLabelSuffix = `row ${childIndex + 1}${childId ? ` (id ${childId})` : ""}`;

  return (
    <tr key={fieldKey}>
      <td>{childIndex + 1}</td>

      {childFieldDefinitions.map((fieldDef) => {
        const cellId = `${childFieldKey}-${fieldDef.key}`;
        const fieldName = `${parentKey}.${parentIndex}.${childKey}.${childIndex}.${fieldDef.key}`;
        const queueKeyForField = `${childEntityQueueKey}:${parentId}:${childId}:${fieldDef.key}`;
        const handleAutosave = (value: unknown) => {
          if (parentId && childId) {
            onChildFieldAutosave(parentId, childId, fieldDef.key, value);
          }
        };
        const commonProps = {
          control,
          name: fieldName,
          inputId: cellId,
          ariaLabel: `${fieldDef.label} for ${childLabelSuffix}`,
          queueKey: queueKeyForField,
          queue,
          submitAttempted,
          onAutosave: handleAutosave,
        };

        if (fieldDef.type === "select") {
          return (
            <td key={fieldDef.key}>
              <FormSelectField
                {...commonProps}
                fieldDef={fieldDef}
                lookups={lookups}
              />
            </td>
          );
        }

        if (fieldDef.type === "number") {
          return (
            <td key={fieldDef.key}>
              <FormNumberField
                {...commonProps}
                fieldDef={fieldDef}
                onChangeValidate={
                  fieldDef.triggersPairValidation
                    ? () =>
                        onChildFieldChangeValidate?.({
                          parentIndex,
                          childIndex,
                          fieldKey: fieldDef.key,
                          trigger,
                          parentKey,
                          childKey,
                        })
                    : undefined
                }
              />
            </td>
          );
        }

        return (
          <td key={fieldDef.key}>
            <FormTextField {...commonProps} fieldDef={fieldDef} />
          </td>
        );
      })}

      <td className="todo-status-cell small text-muted">
        <div>ID: {childId || "-"}</div>
      </td>

      <td>
        <CButton
          color="danger"
          variant="outline"
          size="sm"
          aria-label={`Delete ${childLabel.toLowerCase()} ${childId || `row ${childIndex + 1}`} for ${parentLabel.toLowerCase()} ${parentId || parentIndex + 1}`}
          onClick={() => {
            if (parentId && childId) {
              onRequestDeleteChild(parentId, childId);
            }
          }}
          disabled={!parentId || !childId}
        >
          Delete
        </CButton>
      </td>
    </tr>
  );
}, areListChildRowPropsEqual);

type ListParentCardProps<
  TParent extends { id: string } & Record<string, unknown>,
  TChild extends { id: string } & Record<string, unknown>,
> = {
  parentIndex: number;
  parentKeyId: string;
  formId: string;
  control: Control<any>;
  trigger: UseFormTrigger<any>;
  lookups?: LookupCollection;
  queue: QueueItem[];
  submitAttempted: boolean;
  parentLabel: string;
  childLabel: string;
  childPluralLabel: string;
  parentKey: string;
  childKey: string;
  parentEntityQueueKey: string;
  childEntityQueueKey: string;
  parentFieldDefinitions: FieldDefinition[];
  childFieldDefinitions: FieldDefinition[];
  onAddChildError: (message: string) => void;
  onRequestDeleteParent: (parentId: string) => void;
  onParentFieldAutosave: (
    parentId: string,
    field: string,
    value: unknown,
  ) => void;
  onChildFieldAutosave: (
    parentId: string,
    childId: string,
    field: string,
    value: unknown,
  ) => void;
  onChildFieldChangeValidate?: (
    context: ListToListChangeValidationContext,
  ) => void;
  onCreateChild: (formId: string, parentId: string) => Promise<TChild>;
  onDeleteChild: (
    formId: string,
    parentId: string,
    childId: string,
  ) => Promise<void>;
  getParentProgress: (parent: TParent) => RequiredProgress;
  isChildComplete: (child: TChild) => boolean;
};

function areParentCardPropsEqual(
  prev: ListParentCardProps<any, any>,
  next: ListParentCardProps<any, any>,
) {
  if (
    prev.parentIndex !== next.parentIndex ||
    prev.parentKeyId !== next.parentKeyId ||
    prev.control !== next.control ||
    prev.lookups !== next.lookups ||
    prev.submitAttempted !== next.submitAttempted ||
    prev.formId !== next.formId ||
    prev.onAddChildError !== next.onAddChildError ||
    prev.onRequestDeleteParent !== next.onRequestDeleteParent ||
    prev.onParentFieldAutosave !== next.onParentFieldAutosave ||
    prev.onChildFieldAutosave !== next.onChildFieldAutosave ||
    prev.onChildFieldChangeValidate !== next.onChildFieldChangeValidate ||
    prev.onCreateChild !== next.onCreateChild ||
    prev.onDeleteChild !== next.onDeleteChild ||
    prev.getParentProgress !== next.getParentProgress ||
    prev.isChildComplete !== next.isChildComplete ||
    prev.parentKey !== next.parentKey ||
    prev.childKey !== next.childKey
  ) {
    return false;
  }

  return (
    getParentQueueSignature(prev.queue, prev.parentKeyId) ===
    getParentQueueSignature(next.queue, next.parentKeyId)
  );
}

const ListParentCard = memo(function ListParentCard<
  TParent extends { id: string } & Record<string, unknown>,
  TChild extends { id: string } & Record<string, unknown>,
>({
  parentIndex,
  parentKeyId,
  formId,
  control,
  trigger,
  lookups,
  queue,
  submitAttempted,
  parentLabel,
  childLabel,
  childPluralLabel,
  parentKey,
  childKey,
  parentEntityQueueKey,
  childEntityQueueKey,
  parentFieldDefinitions,
  childFieldDefinitions,
  onAddChildError,
  onRequestDeleteParent,
  onParentFieldAutosave,
  onChildFieldAutosave,
  onChildFieldChangeValidate,
  onCreateChild,
  onDeleteChild,
  getParentProgress,
  isChildComplete,
}: ListParentCardProps<TParent, TChild>) {
  const parent = useWatch({
    control,
    name: `${parentKey}.${parentIndex}` as never,
  }) as TParent | undefined;
  const parentId = parent?.id ?? parentKeyId;
  const parentFieldKey = parentId || `idx-${parentIndex}`;

  const [childDeleteTargetId, setChildDeleteTargetId] = useState<string | null>(
    null,
  );
  const [isChildDeleteModalVisible, setIsChildDeleteModalVisible] =
    useState(false);

  const {
    fields: childFields,
    append: appendChild,
    remove: removeChild,
  } = useFieldArray({
    control,
    name: `${parentKey}.${parentIndex}.${childKey}` as never,
    keyName: "fieldKey",
  });

  const handleAddChild = useCallback(async () => {
    if (!parentId) return;
    try {
      const created = await onCreateChild(formId, parentId);
      appendChild(created as never);
      const firstChildFieldKey = childFieldDefinitions[0]?.key;
      if (firstChildFieldKey) {
        focusElementById(`${created.id}-${firstChildFieldKey}`);
      }
    } catch {
      onAddChildError(`Unable to add ${childLabel.toLowerCase()}.`);
    }
  }, [
    appendChild,
    childFieldDefinitions,
    childLabel,
    formId,
    onAddChildError,
    onCreateChild,
    parentId,
  ]);

  const requestDeleteChild = useCallback(
    (targetParentId: string, childId: string) => {
      if (!parentId || targetParentId !== parentId) return;
      setChildDeleteTargetId(childId);
      setIsChildDeleteModalVisible(true);
    },
    [parentId],
  );

  const closeChildDeleteModal = useCallback(() => {
    setIsChildDeleteModalVisible(false);
    setChildDeleteTargetId(null);
  }, []);

  const handleConfirmDeleteChild = useCallback(async () => {
    if (!parentId || !childDeleteTargetId) return;

    try {
      await onDeleteChild(formId, parentId, childDeleteTargetId);
      const children =
        ((parent as Record<string, unknown> | undefined)?.[childKey] as
          | TChild[]
          | undefined) ?? [];
      const childIndex = children.findIndex(
        (child) => child.id === childDeleteTargetId,
      );
      if (childIndex >= 0) {
        removeChild(childIndex);
      }
    } catch {
      onAddChildError(
        `Unable to delete ${childLabel.toLowerCase()} with id: ${childDeleteTargetId} for ${parentLabel.toLowerCase()} id: ${parentId}.`,
      );
    } finally {
      closeChildDeleteModal();
    }
  }, [
    childDeleteTargetId,
    childKey,
    childLabel,
    closeChildDeleteModal,
    formId,
    onAddChildError,
    onDeleteChild,
    parent,
    parentId,
    parentLabel,
    removeChild,
  ]);

  const parentProgress = useMemo(
    () =>
      parent
        ? getParentProgress(parent)
        : { totalRequired: 0, completedRequired: 0, remainingRequired: 0 },
    [getParentProgress, parent],
  );

  const parentIsValid = parentProgress.remainingRequired === 0;
  const children =
    ((parent as Record<string, unknown> | undefined)?.[childKey] as TChild[]) ??
    [];
  const childrenAreValid =
    children.length > 0 && children.every(isChildComplete);

  return (
    <CCard
      className={`mt-3 ${parentIsValid ? "card-required-valid" : "card-required-missing"}`}
      key={parentId || `${parentKey}-${parentIndex}`}
    >
      <CCardHeader>
        <div className="d-flex align-items-center justify-content-between gap-3">
          <h2 className="h5 mb-0">
            {parentLabel} {parentIndex + 1}
            {parentId ? ` - ${parentId}` : ""}
          </h2>
          <RequiredCounter
            progress={parentProgress}
            label={`${parentLabel} ${parentIndex + 1} required fields`}
            compact
          />
        </div>
      </CCardHeader>

      <CCardBody>
        <CRow>
          <CCol md={9}>
            <CRow>
              {parentFieldDefinitions.map((fieldDef) => {
                const fieldId = `${parentFieldKey}-${fieldDef.key}`;
                const fieldName = `${parentKey}.${parentIndex}.${fieldDef.key}`;
                const queueKeyForField = `${parentEntityQueueKey}:${parentId}:${fieldDef.key}`;
                const handleAutosave = (value: unknown) => {
                  if (parentId) {
                    onParentFieldAutosave(parentId, fieldDef.key, value);
                  }
                };
                const commonProps = {
                  control,
                  name: fieldName,
                  inputId: fieldId,
                  ariaLabel: fieldDef.label,
                  queueKey: queueKeyForField,
                  queue,
                  submitAttempted,
                  onAutosave: handleAutosave,
                };

                return (
                  <CCol key={fieldDef.key} md={fieldDef.columnMd ?? 4}>
                    <CFormLabel htmlFor={fieldId}>
                      <RequiredLabel
                        label={fieldDef.label}
                        tooltip={fieldDef.tooltip}
                        required={fieldDef.required}
                      />
                    </CFormLabel>

                    {fieldDef.type === "select" ? (
                      <FormSelectField
                        {...commonProps}
                        fieldDef={fieldDef}
                        lookups={lookups}
                      />
                    ) : fieldDef.type === "number" ? (
                      <FormNumberField {...commonProps} fieldDef={fieldDef} />
                    ) : (
                      <FormTextField {...commonProps} fieldDef={fieldDef} />
                    )}
                  </CCol>
                );
              })}
            </CRow>
          </CCol>

          <CCol
            md={3}
            className="d-flex align-items-center justify-content-end"
          >
            <CButton
              color="danger"
              variant="outline"
              onClick={() => {
                if (parentId) {
                  onRequestDeleteParent(parentId);
                }
              }}
              disabled={!parentId}
            >
              Delete {parentLabel}
            </CButton>
          </CCol>
        </CRow>

        <CRow className="mt-4">
          <CCol md={9}>
            <CCard
              className={`${childrenAreValid ? "card-required-valid" : "card-required-missing"}`}
            >
              <CCardHeader>
                <h3 className="h6 mb-0">{childPluralLabel}</h3>
              </CCardHeader>

              <CCardBody>
                <div className="table-responsive mt-2">
                  <table className="table table-sm align-middle todo-table">
                    <thead>
                      <tr>
                        <th scope="col">#</th>
                        {childFieldDefinitions.map((fieldDef) => (
                          <th key={fieldDef.key} scope="col">
                            <RequiredLabel
                              label={fieldDef.label}
                              tooltip={fieldDef.tooltip}
                              required={fieldDef.required}
                            />
                          </th>
                        ))}
                        <th scope="col">ID</th>
                        <th scope="col">Actions</th>
                      </tr>
                    </thead>

                    <tbody>
                      {childFields.length === 0 && (
                        <tr>
                          <td
                            colSpan={childFieldDefinitions.length + 3}
                            className="text-muted small"
                          >
                            No {childPluralLabel.toLowerCase()} yet. Use Add{" "}
                            {childLabel} below to create one.
                          </td>
                        </tr>
                      )}

                      {childFields.map((childField, childIndex) => (
                        <ListChildRow
                          key={childField.fieldKey}
                          parentIndex={parentIndex}
                          childIndex={childIndex}
                          fieldKey={childField.fieldKey}
                          childKeyId={String(
                            (childField as Record<string, unknown>).id ?? "",
                          )}
                          parentId={parentId}
                          parentLabel={parentLabel}
                          childLabel={childLabel}
                          parentKey={parentKey}
                          childKey={childKey}
                          childEntityQueueKey={childEntityQueueKey}
                          control={control}
                          lookups={lookups}
                          queue={queue}
                          submitAttempted={submitAttempted}
                          childFieldDefinitions={childFieldDefinitions}
                          onChildFieldAutosave={onChildFieldAutosave}
                          onChildFieldChangeValidate={
                            onChildFieldChangeValidate
                          }
                          onRequestDeleteChild={requestDeleteChild}
                          trigger={trigger}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </CCardBody>

              <CCardFooter className="d-flex justify-content-end">
                <CButton
                  color="success"
                  onClick={() => {
                    void handleAddChild();
                  }}
                  disabled={!parentId}
                >
                  Add {childLabel}
                </CButton>
              </CCardFooter>
            </CCard>
          </CCol>
        </CRow>
      </CCardBody>

      <CModal
        visible={isChildDeleteModalVisible}
        onClose={closeChildDeleteModal}
        alignment="center"
      >
        <CModalHeader>
          <CModalTitle>Confirm Delete</CModalTitle>
        </CModalHeader>
        <CModalBody>
          {childDeleteTargetId
            ? `Are you sure you want to delete ${childLabel.toLowerCase()} with id: ${childDeleteTargetId} for ${parentLabel.toLowerCase()} id: ${parentId}?`
            : `Are you sure you want to delete this ${childLabel.toLowerCase()}?`}
        </CModalBody>
        <CModalFooter>
          <CButton
            color="secondary"
            variant="outline"
            onClick={closeChildDeleteModal}
          >
            Cancel
          </CButton>
          <CButton
            color="danger"
            onClick={() => {
              void handleConfirmDeleteChild();
            }}
          >
            Delete
          </CButton>
        </CModalFooter>
      </CModal>
    </CCard>
  );
}, areParentCardPropsEqual) as <
  TParent extends { id: string } & Record<string, unknown>,
  TChild extends { id: string } & Record<string, unknown>,
>(
  props: ListParentCardProps<TParent, TChild>,
) => ReactElement;

const SubmitActions = memo(function SubmitActions({
  control,
  onSubmit,
  onRetryFailed,
  hasFailed,
}: {
  control: Control<any>;
  onSubmit: () => void;
  onRetryFailed: () => void;
  hasFailed: boolean;
}) {
  const { isSubmitting } = useFormState({ control });

  return (
    <div className="mt-4 d-flex gap-2">
      <CButton color="primary" onClick={onSubmit} disabled={isSubmitting}>
        {isSubmitting ? "Submitting..." : "Submit"}
      </CButton>

      {hasFailed && (
        <CButton color="secondary" variant="outline" onClick={onRetryFailed}>
          Retry Failed Saves
        </CButton>
      )}
    </div>
  );
});

export function ListToListManager<
  TParent extends { id: string } & Record<string, unknown>,
  TChild extends { id: string } & Record<string, unknown>,
>({
  formId,
  title,
  introText,
  privacyNotice,
  parentLabel,
  parentPluralLabel,
  childLabel,
  childPluralLabel,
  parentKey,
  childKey,
  parentEntityQueueKey,
  childEntityQueueKey,
  parentFieldDefinitions,
  childFieldDefinitions,
  validationSchema,
  lookups,
  initialParents,
  isInitialDataResolved,
  isLoading,
  isLookupsLoading,
  loadError,
  lookupsError,
  isOnline,
  queue,
  queueSummary,
  lastSavedAt,
  onRetryFailed,
  onCreateParent,
  onDeleteParent,
  onCreateChild,
  onDeleteChild,
  onParentFieldAutosave,
  onChildFieldAutosave,
  onChildFieldChangeValidate,
  getParentProgress,
  isChildComplete,
  onSubmitAll,
}: ListToListManagerProps<TParent, TChild>) {
  const [submitState, setSubmitState] = useState<{
    message: string;
    status: "success" | "error";
  } | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);

  const hydratedFormIdRef = useRef<string | null>(null);

  const form = useForm<{ [key: string]: TParent[] }>({
    resolver: yupResolver(validationSchema as never) as never,
    defaultValues: { [parentKey]: [] },
    mode: "onChange",
  });

  const { control, getValues, handleSubmit, reset, trigger } = form;

  const {
    fields: parentFields,
    append: appendParent,
    remove: removeParent,
  } = useFieldArray({
    control,
    name: parentKey as never,
    keyName: "fieldKey",
  });

  useEffect(() => {
    if (isLoading || !isInitialDataResolved) {
      return;
    }

    const currentValues = getValues() as Record<string, unknown>;
    const currentParents =
      (currentValues[parentKey] as TParent[] | undefined) ?? [];

    const isNewForm = hydratedFormIdRef.current !== formId;
    const shouldHydrateEmptyForm =
      currentParents.length === 0 && initialParents.length > 0;

    if (!isNewForm && !shouldHydrateEmptyForm) {
      return;
    }

    reset({ [parentKey]: initialParents });
    hydratedFormIdRef.current = formId;
  }, [
    formId,
    getValues,
    initialParents,
    isInitialDataResolved,
    isLoading,
    parentKey,
    reset,
  ]);

  const handleAddParent = async () => {
    setSubmitState(null);
    try {
      const created = await onCreateParent(formId);
      appendParent(created as never);
      const firstParentFieldKey = parentFieldDefinitions[0]?.key;
      if (firstParentFieldKey) {
        focusElementById(`${created.id}-${firstParentFieldKey}`);
      }
    } catch {
      setSubmitState({
        message: `Unable to add ${parentLabel.toLowerCase()}.`,
        status: "error",
      });
    }
  };

  const handleDeleteParent = async (parentId: string) => {
    setSubmitState(null);
    const values = getValues() as Record<string, unknown>;
    const parents = (values[parentKey] as TParent[] | undefined) ?? [];
    const parentIndex = parents.findIndex((parent) => parent.id === parentId);
    if (parentIndex < 0) return;

    try {
      await onDeleteParent(formId, parentId);
      removeParent(parentIndex);
    } catch {
      setSubmitState({
        message: `Unable to delete ${parentLabel.toLowerCase()} with id: ${parentId}.`,
        status: "error",
      });
    }
  };

  const handleAddChildError = useCallback((message: string) => {
    setSubmitState({ message, status: "error" });
  }, []);

  const openDeleteModal = (target: DeleteTarget) => {
    setDeleteTarget(target);
    setIsDeleteModalVisible(true);
  };

  const closeDeleteModal = () => {
    setIsDeleteModalVisible(false);
    setDeleteTarget(null);
  };

  const requestDeleteParent = useCallback((parentId: string) => {
    openDeleteModal({ parentId });
  }, []);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await handleDeleteParent(deleteTarget.parentId);
    } finally {
      closeDeleteModal();
    }
  };

  const onValidSubmit = async (values: { [key: string]: TParent[] }) => {
    setSubmitAttempted(true);
    setSubmitState(null);

    try {
      await onSubmitAll(formId, values[parentKey] ?? []);
      setSubmitState({
        message: "Form submitted successfully.",
        status: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to submit.";
      setSubmitState({ message, status: "error" });
    }
  };

  const onInvalidSubmit = () => {
    setSubmitAttempted(true);
    setSubmitState({
      message: "Please fix validation errors before submitting.",
      status: "error",
    });
  };

  if (isLoading || isLookupsLoading || !isInitialDataResolved) {
    return (
      <CContainer className="py-4">
        <div role="status" aria-live="polite">
          <CSpinner /> Loading form definition and data...
        </div>
      </CContainer>
    );
  }

  if (loadError || lookupsError) {
    return (
      <CContainer className="py-4">
        <CAlert color="danger" role="alert">
          Unable to load form data.
        </CAlert>
      </CContainer>
    );
  }

  return (
    <CContainer className="py-4">
      <h1>{title}</h1>
      {privacyNotice && <p>{privacyNotice}</p>}
      {introText && <p className="text-muted small">{introText}</p>}

      <GlobalSaveStatus
        isOnline={isOnline}
        pending={queueSummary.pending}
        saving={queueSummary.saving}
        failed={queueSummary.failed}
        lastSavedAt={lastSavedAt}
        onRetryFailed={onRetryFailed}
      />

      <OverallRequiredCounter
        control={control}
        parentKey={parentKey}
        getParentProgress={getParentProgress}
      />
      <ParentsRootError control={control} parentKey={parentKey} />

      {submitState && (
        <CAlert
          color={submitState.status === "success" ? "success" : "danger"}
          role={submitState.status === "success" ? "status" : "alert"}
        >
          {submitState.message}
        </CAlert>
      )}

      <div className="d-flex align-items-center justify-content-between gap-3 flex-wrap">
        <CButton
          color="primary"
          onClick={() => {
            void handleAddParent();
          }}
        >
          Add {parentLabel}
        </CButton>
        <OverallCounts
          control={control}
          parentKey={parentKey}
          childKey={childKey}
          parentPluralLabel={parentPluralLabel}
          childPluralLabel={childPluralLabel}
        />
      </div>

      {parentFields.map((parentField, parentIndex) => (
        <ListParentCard<TParent, TChild>
          key={parentField.fieldKey}
          parentIndex={parentIndex}
          parentKeyId={String(
            (parentField as Record<string, unknown>).id ?? "",
          )}
          formId={formId}
          control={control}
          trigger={trigger}
          lookups={lookups}
          queue={queue}
          submitAttempted={submitAttempted}
          parentLabel={parentLabel}
          childLabel={childLabel}
          childPluralLabel={childPluralLabel}
          parentKey={parentKey}
          childKey={childKey}
          parentEntityQueueKey={parentEntityQueueKey}
          childEntityQueueKey={childEntityQueueKey}
          parentFieldDefinitions={parentFieldDefinitions}
          childFieldDefinitions={childFieldDefinitions}
          onAddChildError={handleAddChildError}
          onRequestDeleteParent={requestDeleteParent}
          onParentFieldAutosave={onParentFieldAutosave}
          onChildFieldAutosave={onChildFieldAutosave}
          onChildFieldChangeValidate={onChildFieldChangeValidate}
          onCreateChild={onCreateChild}
          onDeleteChild={onDeleteChild}
          getParentProgress={getParentProgress}
          isChildComplete={isChildComplete}
        />
      ))}

      <SubmitActions
        control={control}
        onSubmit={() => {
          void handleSubmit(onValidSubmit, onInvalidSubmit)();
        }}
        onRetryFailed={onRetryFailed}
        hasFailed={queueSummary.failed > 0}
      />

      <CModal
        visible={isDeleteModalVisible}
        onClose={closeDeleteModal}
        alignment="center"
      >
        <CModalHeader>
          <CModalTitle>Confirm Delete</CModalTitle>
        </CModalHeader>
        <CModalBody>
          {deleteTarget
            ? `Are you sure you want to delete ${parentLabel.toLowerCase()} with id: ${deleteTarget.parentId} and all related ${childPluralLabel.toLowerCase()}?`
            : "Are you sure you want to delete this item?"}
        </CModalBody>
        <CModalFooter>
          <CButton
            color="secondary"
            variant="outline"
            onClick={closeDeleteModal}
          >
            Cancel
          </CButton>
          <CButton
            color="danger"
            onClick={() => {
              void handleConfirmDelete();
            }}
          >
            Delete
          </CButton>
        </CModalFooter>
      </CModal>
    </CContainer>
  );
}

export type { ListToListManagerProps, ListToListChangeValidationContext };

export type {
  FieldDefinition,
  LookupCollection,
  NumberFieldDefinition,
  QueueItem,
  RequiredProgress,
  SelectFieldDefinition,
  TextFieldDefinition,
} from "./types";
