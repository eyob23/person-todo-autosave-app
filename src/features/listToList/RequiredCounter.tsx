import { CAlert, CProgress, CProgressBar } from "@coreui/react";
import type { RequiredProgress } from "./types";

type Props = {
  progress: RequiredProgress;
  label?: string;
  compact?: boolean;
};

export function RequiredCounter({
  progress,
  label = "Required fields",
  compact = false,
}: Props) {
  const percent =
    progress.totalRequired === 0
      ? 100
      : Math.round((progress.completedRequired / progress.totalRequired) * 100);

  const color = progress.remainingRequired === 0 ? "success" : "warning";

  if (compact) {
    return (
      <div className="required-counter-compact" aria-live="polite">
        <div
          className={`required-counter-compact-text fw-semibold text-${color}`}
        >
          Completed: {progress.completedRequired} of {progress.totalRequired} |
          Remaining: {progress.remainingRequired}
        </div>
        <CProgress
          className="mt-1 required-counter-compact-progress"
          aria-label={`${label} progress ${percent}%`}
        >
          <CProgressBar color={color} value={percent}>
            {percent}%
          </CProgressBar>
        </CProgress>
      </div>
    );
  }

  return (
    <CAlert color={color} aria-live="polite">
      <div>
        <strong>{label} completed:</strong> {progress.completedRequired} of{" "}
        {progress.totalRequired} | <strong>Remaining:</strong>{" "}
        {progress.remainingRequired}
      </div>
      <CProgress className="mt-2" aria-label={`${label} progress ${percent}%`}>
        <CProgressBar value={percent}>{percent}%</CProgressBar>
      </CProgress>
    </CAlert>
  );
}
