import { useEffect, useRef, useState } from "react";
import type { QueueItem } from "./types";

type Props = {
  queueKey: string;
  queue: QueueItem[];
};

export function FieldSaveStatus({ queueKey, queue }: Props) {
  const item = queue.find((x) => x.queueKey === queueKey);
  const [showSaved, setShowSaved] = useState(false);
  const previousItemRef = useRef<QueueItem | undefined>(undefined);

  useEffect(() => {
    const previousItem = previousItemRef.current;

    if (item) {
      setShowSaved(false);
    } else if (previousItem && previousItem.status !== "failed") {
      setShowSaved(true);
      const timer = window.setTimeout(() => {
        setShowSaved(false);
      }, 3000);

      previousItemRef.current = item;
      return () => window.clearTimeout(timer);
    }

    previousItemRef.current = item;
  }, [item]);

  const isVisible = Boolean(item) || showSaved;

  let text = "Saved";
  let textClass = "text-success";
  let role: "alert" | undefined;
  let ariaLive: "polite" | undefined = "polite";

  if (item?.status === "saving") {
    text = "Saving...";
    textClass = "";
  } else if (item?.status === "failed") {
    text = `Save failed. ${item.lastError ?? ""}`.trim();
    textClass = "text-danger";
    role = "alert";
    ariaLive = undefined;
  } else if (item?.status === "pending") {
    text = "Pending save...";
    textClass = "";
  }

  const className = [
    "field-status",
    "small",
    textClass,
    "field-status-transition",
    !isVisible ? "field-status-hidden" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      role={role}
      aria-live={ariaLive}
      aria-hidden={!isVisible}
    >
      {text}
    </div>
  );
}
