import { CAlert, CButton } from "@coreui/react";

type Props = {
  isOnline: boolean;
  pending: number;
  saving: number;
  failed: number;
  lastSavedAt: string | null;
  onRetryFailed: () => void;
};

export function GlobalSaveStatus({
  isOnline,
  pending,
  saving,
  failed,
  lastSavedAt,
  onRetryFailed,
}: Props) {
  if (!isOnline) {
    return (
      <CAlert
        color="warning"
        role="status"
        aria-live="polite"
        className="sticky-status"
      >
        Offline — changes are kept in short-lived memory and will sync while
        this page remains open.
      </CAlert>
    );
  }

  // Nothing to report yet — no saves have been attempted
  if (lastSavedAt === null && pending === 0 && saving === 0 && failed === 0) {
    return null;
  }

  if (failed > 0) {
    return (
      <CAlert color="danger" role="alert" className="sticky-status">
        {failed} change{failed === 1 ? "" : "s"} failed to save.{" "}
        <CButton
          color="danger"
          variant="outline"
          size="sm"
          onClick={onRetryFailed}
        >
          Retry failed saves
        </CButton>
      </CAlert>
    );
  }

  if (saving > 0 || pending > 0) {
    return (
      <CAlert
        color="info"
        role="status"
        aria-live="polite"
        className="sticky-status"
      >
        Saving changes... Pending: {pending}, Saving: {saving}
      </CAlert>
    );
  }

  return (
    <CAlert
      color="success"
      role="status"
      aria-live="polite"
      className="sticky-status"
    >
      All changes saved{lastSavedAt ? ` at ${lastSavedAt}` : ""}.
    </CAlert>
  );
}
