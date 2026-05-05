import { ComboBox } from "@progress/kendo-react-dropdowns";
import { cloneElement, useEffect, useMemo, useRef, useState } from "react";
import { useLazySearchPersonObjectsQuery } from "../personTodo/personApi";
import type { LookupOption } from "./types";

type PersonObjectPickerProps = {
  inputId: string;
  name: string;
  ariaLabel: string;
  ariaDescribedBy?: string;
  placeholder: string;
  formId: string;
  value: LookupOption | null;
  onBlur: () => void;
  onChange: (value: LookupOption | null) => void;
};

export function PersonObjectPicker({
  inputId,
  name,
  ariaLabel,
  ariaDescribedBy,
  placeholder,
  formId,
  value,
  onBlur,
  onChange,
}: PersonObjectPickerProps) {
  const [searchPersonObjects] = useLazySearchPersonObjectsQuery();
  const [queryText, setQueryText] = useState("");
  const [remoteOptions, setRemoteOptions] = useState<LookupOption[]>([]);
  const [isLoadingRemoteOptions, setIsLoadingRemoteOptions] = useState(false);
  const requestSequenceRef = useRef(0);

  useEffect(() => {
    const sequence = ++requestSequenceRef.current;

    const timer = window.setTimeout(async () => {
      setIsLoadingRemoteOptions(true);
      try {
        const nextOptions = await searchPersonObjects({
          formId,
          query: queryText.trim(),
        }).unwrap();

        if (requestSequenceRef.current === sequence) {
          setRemoteOptions(nextOptions);
        }
      } catch {
        if (requestSequenceRef.current === sequence) {
          setRemoteOptions([]);
        }
      } finally {
        if (requestSequenceRef.current === sequence) {
          setIsLoadingRemoteOptions(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [formId, queryText, searchPersonObjects]);

  const comboData = useMemo(() => {
    if (!value) {
      return remoteOptions;
    }

    const exists = remoteOptions.some((option) => option.id === value.id);
    return exists ? remoteOptions : [value, ...remoteOptions];
  }, [remoteOptions, value]);

  const selectedDescription = value?.description?.trim() ?? "";
  const selectedDescriptionId = `${inputId}-selected-description`;
  const mergedDescribedBy = [
    ariaDescribedBy ?? "",
    selectedDescription ? selectedDescriptionId : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <ComboBox
        id={inputId}
        name={name}
        data={comboData}
        textField="name"
        dataItemKey="id"
        value={value}
        placeholder={placeholder}
        suggest
        filterable
        clearButton
        loading={isLoadingRemoteOptions}
        itemRender={(li, itemProps) => {
          const option = itemProps.dataItem as LookupOption;
          const tooltipText = option.description ?? option.name;

          return cloneElement(
            li,
            { title: tooltipText },
            <div className="d-flex flex-column">
              <span>{option.name}</span>
              {option.description && (
                <small className="text-muted">{option.description}</small>
              )}
            </div>,
          );
        }}
        ariaLabel={ariaLabel}
        ariaDescribedBy={mergedDescribedBy || undefined}
        onBlur={onBlur}
        onFilterChange={(event) => {
          setQueryText(event.filter.value ?? "");
        }}
        onChange={(event) => {
          const nextRawValue = event.value as LookupOption | string | null;

          // While typing for filtering, Kendo can emit text values.
          if (typeof nextRawValue === "string") {
            return;
          }

          onChange(nextRawValue ?? null);
        }}
      />

      {selectedDescription && (
        <div
          id={selectedDescriptionId}
          className="small text-muted mt-1"
          role="note"
          aria-live="polite"
          title={selectedDescription}
        >
          {selectedDescription}
        </div>
      )}
    </>
  );
}
