import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  formatUserErrorMessage,
  logApiError,
  normalizeApiError,
} from "./errorHandling";
import { emitAutosaveTrace } from "./autosaveTrace";

const MAX_RETRIES = 4;
const RETRY_DELAYS_MS = [2000, 5000, 15000, 60000];

export type QueueEntry<TPayload = Record<string, unknown>> = {
  id: string;
  queueKey: string;
  /** Domain-specific metadata needed by the saveFn (e.g. entityType, personId). */
  payload: TPayload;
  changes: Record<string, unknown>;
  status: "pending" | "saving" | "failed";
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
};

type UseAutosaveQueueArgs<TPayload> = {
  isOnline: boolean;
  /** Called once per pending entry. Throw to signal failure; return to signal success. */
  saveFn: (entry: QueueEntry<TPayload>) => Promise<unknown>;
  /** CustomEvent name dispatched on window on save errors. @default "api:error" */
  errorEventName?: string;
};

type EnqueueArgs<TPayload> = {
  queueKey: string;
  payload: TPayload;
  changes: Record<string, unknown>;
};

function now() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function haveSameChanges(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) {
      return false;
    }
    if (!Object.is(left[key], right[key])) {
      return false;
    }
  }

  return true;
}

export function useAutosaveQueue<TPayload = Record<string, unknown>>({
  isOnline,
  saveFn,
  errorEventName = "api:error",
}: UseAutosaveQueueArgs<TPayload>) {
  const [queue, setQueue] = useState<QueueEntry<TPayload>[]>([]);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const processingRef = useRef(false);
  const processingPromiseRef = useRef<Promise<void> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveFnRef = useRef(saveFn);
  const lastSavedChangesRef = useRef(
    new Map<string, Record<string, unknown>>(),
  );
  const enqueueSequenceRef = useRef(0);
  const lastAppliedEnqueueSequenceRef = useRef(0);

  // Kept in sync synchronously inside every setQueue functional updater so that
  // flushQueue and the processQueue while-loop always read up-to-date state
  // without waiting for a React render + useEffect cycle.
  const queueRef = useRef<QueueEntry<TPayload>[]>([]);

  useEffect(() => {
    saveFnRef.current = saveFn;
  }, [saveFn]);

  const queueSummary = useMemo(() => {
    const pending = queue.filter((q) => q.status === "pending").length;
    const saving = queue.filter((q) => q.status === "saving").length;
    const failed = queue.filter((q) => q.status === "failed").length;

    return {
      pending,
      saving,
      failed,
      total: queue.length,
      hasBlockingChanges: pending > 0 || saving > 0 || failed > 0,
    };
  }, [queue]);

  const enqueue = useCallback((args: EnqueueArgs<TPayload>) => {
    const enqueueSequence = ++enqueueSequenceRef.current;
    setQueue((current) => {
      // In React StrictMode (dev), updater functions may be replayed.
      // Keep enqueue idempotent per enqueue call to avoid duplicate queue items.
      if (lastAppliedEnqueueSequenceRef.current === enqueueSequence) {
        emitAutosaveTrace("queue:enqueue:replay-skip", {
          enqueueSequence,
          queueKey: args.queueKey,
          changes: args.changes,
        });
        return current;
      }
      lastAppliedEnqueueSequenceRef.current = enqueueSequence;

      const existingIndex = current.findIndex(
        (x) => x.queueKey === args.queueKey,
      );

      if (existingIndex >= 0) {
        const copy = [...current];
        const existing = copy[existingIndex];

        // Guard against duplicate change events that emit the same value while
        // this field is already pending/saving. Without this, the same payload
        // can be sent twice (once for each identical onChange emission).
        if (
          (existing.status === "pending" || existing.status === "saving") &&
          haveSameChanges(existing.changes, args.changes)
        ) {
          emitAutosaveTrace("queue:enqueue:dedupe-inflight", {
            queueKey: args.queueKey,
            status: existing.status,
            changes: args.changes,
          });
          return current;
        }

        copy[existingIndex] = {
          ...existing,
          changes: args.changes,
          status: "pending",
          // Reset retryCount so re-edited items get a fresh set of retries,
          // not leftover counts from a previous failure on the same field.
          retryCount: 0,
          updatedAt: now(),
          lastError: undefined,
        };

        queueRef.current = copy;
        emitAutosaveTrace("queue:enqueue:update-existing", {
          queueKey: args.queueKey,
          previousStatus: existing.status,
          changes: args.changes,
        });
        return copy;
      }

      // If the same value has already been successfully saved for this field,
      // skip re-enqueueing it.
      const previouslySaved = lastSavedChangesRef.current.get(args.queueKey);
      if (previouslySaved && haveSameChanges(previouslySaved, args.changes)) {
        emitAutosaveTrace("queue:enqueue:dedupe-saved", {
          queueKey: args.queueKey,
          changes: args.changes,
        });
        return current;
      }

      const newQueue = [
        ...current,
        {
          id: createId(),
          queueKey: args.queueKey,
          payload: args.payload,
          changes: args.changes,
          status: "pending" as const,
          retryCount: 0,
          createdAt: now(),
          updatedAt: now(),
        },
      ];
      queueRef.current = newQueue;
      emitAutosaveTrace("queue:enqueue:new", {
        queueKey: args.queueKey,
        changes: args.changes,
      });
      return newQueue;
    });
  }, []);

  const processQueue = useCallback((): Promise<void> => {
    if (processingRef.current || !isOnline) return Promise.resolve();

    processingRef.current = true;

    const promise: Promise<void> = (async () => {
      try {
        while (true) {
          const next = queueRef.current.find((x) => x.status === "pending");
          if (!next) break;

          // Snapshot updatedAt before the async save so we can detect whether
          // the user re-edited the field while the save was in-flight.
          const snapshotUpdatedAt = next.updatedAt;

          setQueue((current) => {
            const updated = current.map((item) =>
              item.id === next.id
                ? { ...item, status: "saving" as const }
                : item,
            );
            queueRef.current = updated;
            return updated;
          });

          emitAutosaveTrace("queue:save:start", {
            queueKey: next.queueKey,
            id: next.id,
            retryCount: next.retryCount,
            changes: next.changes,
            payload: next.payload as Record<string, unknown>,
          });

          try {
            await saveFnRef.current(next);

            // Remember the last successfully-saved payload for this queue key
            // so repeated identical events don't issue duplicate PATCH calls.
            lastSavedChangesRef.current.set(next.queueKey, {
              ...next.changes,
            });

            emitAutosaveTrace("queue:save:success", {
              queueKey: next.queueKey,
              id: next.id,
              changes: next.changes,
            });

            setLastSavedAt(new Date().toLocaleTimeString());

            setQueue((current) => {
              const updated = current.reduce<QueueEntry<TPayload>[]>(
                (acc, item) => {
                  if (item.id !== next.id) {
                    acc.push(item);
                  } else if (item.updatedAt !== snapshotUpdatedAt) {
                    // The field was re-edited while this save was in-flight.
                    // Keep the item as pending so the new changes get saved.
                    acc.push({ ...item, status: "pending" as const });
                  }
                  // Otherwise: same version was saved — remove it.
                  return acc;
                },
                [],
              );
              queueRef.current = updated;
              return updated;
            });
          } catch (error) {
            const nextRetryCount = next.retryCount + 1;
            const normalized = normalizeApiError(
              error,
              "Unable to save change. Please retry.",
            );
            const message = formatUserErrorMessage(normalized);

            logApiError(
              "autosave",
              normalized,
              {
                queueKey: next.queueKey,
                retryCount: nextRetryCount,
                maxRetries: MAX_RETRIES,
                payload: next.payload,
              },
              errorEventName,
            );

            setQueue((current) => {
              const updated = current.map((item) =>
                item.id === next.id
                  ? {
                      ...item,
                      status: (nextRetryCount >= MAX_RETRIES
                        ? "failed"
                        : "pending") as QueueEntry<TPayload>["status"],
                      retryCount: nextRetryCount,
                      lastError: message,
                    }
                  : item,
              );
              queueRef.current = updated;
              return updated;
            });

            emitAutosaveTrace("queue:save:failure", {
              queueKey: next.queueKey,
              id: next.id,
              retryCount: nextRetryCount,
              message,
            });

            if (nextRetryCount < MAX_RETRIES) {
              const delay =
                RETRY_DELAYS_MS[
                  Math.min(nextRetryCount - 1, RETRY_DELAYS_MS.length - 1)
                ];
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            }

            // Do not block subsequent pending changes if one item permanently fails.
            continue;
          }
        }
      } finally {
        processingRef.current = false;
        processingPromiseRef.current = null;
      }
    })();

    processingPromiseRef.current = promise;
    return promise;
  }, [isOnline, errorEventName]);

  useEffect(() => {
    if (!isOnline) return;

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
    }

    retryTimerRef.current = setTimeout(() => {
      void processQueue();
    }, 700);

    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, [queue, isOnline, processQueue]);

  const retryFailed = useCallback(() => {
    setQueue((current) => {
      const updated = current.map((item) =>
        item.status === "failed"
          ? {
              ...item,
              status: "pending" as const,
              retryCount: 0,
              lastError: undefined,
            }
          : item,
      );
      queueRef.current = updated;
      return updated;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue(() => {
      queueRef.current = [];
      return [];
    });
  }, []);

  const flushQueue = useCallback(async () => {
    // Wait for any in-flight background save to complete before starting the
    // flush pass. Without this, processQueue() returns immediately (process
    // lock is held), flushQueue sees "saving" items, and throws a false error.
    if (processingPromiseRef.current) {
      await processingPromiseRef.current;
    }
    await processQueue();

    const hasRemaining = queueRef.current.some(
      (item) =>
        item.status === "pending" ||
        item.status === "saving" ||
        item.status === "failed",
    );

    if (hasRemaining) {
      throw new Error(
        "Some changes were not saved. Please retry failed saves.",
      );
    }
  }, [processQueue]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (queueRef.current.length > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handler);

    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, []);

  return {
    queue,
    queueSummary,
    lastSavedAt,
    enqueue,
    retryFailed,
    clearQueue,
    flushQueue,
  };
}
