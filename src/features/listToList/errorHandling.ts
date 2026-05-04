import type { SerializedError } from "@reduxjs/toolkit";
import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";

export type NormalizedApiError = {
  userMessage: string;
  technicalMessage: string;
  requestId?: string;
  status?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFetchBaseQueryError(error: unknown): error is FetchBaseQueryError {
  return isRecord(error) && "status" in error;
}

function isSerializedError(error: unknown): error is SerializedError {
  return (
    isRecord(error) &&
    ("message" in error ||
      "name" in error ||
      "stack" in error ||
      "code" in error)
  );
}

function pickMessage(data: unknown): string | undefined {
  if (typeof data === "string" && data.trim().length > 0) {
    return data;
  }

  if (!isRecord(data)) {
    return undefined;
  }

  const candidateKeys = ["message", "error", "detail", "title"] as const;
  for (const key of candidateKeys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function pickRequestId(data: unknown): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }

  const candidateKeys = ["requestId", "correlationId", "traceId"] as const;
  for (const key of candidateKeys) {
    const value = data[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }

  return undefined;
}

function pickTransportError(error: FetchBaseQueryError): string | undefined {
  if ("error" in error && typeof error.error === "string") {
    return error.error;
  }

  return undefined;
}

export function normalizeApiError(
  error: unknown,
  fallbackUserMessage: string,
): NormalizedApiError {
  if (isFetchBaseQueryError(error)) {
    const status = typeof error.status === "number" ? error.status : undefined;
    const messageFromData = pickMessage(error.data);
    const requestId = pickRequestId(error.data);
    const technicalMessage =
      messageFromData ?? pickTransportError(error) ?? "Request failed";

    return {
      status,
      requestId,
      userMessage: fallbackUserMessage,
      technicalMessage,
    };
  }

  if (isSerializedError(error)) {
    const technicalMessage =
      typeof error.message === "string" && error.message.length > 0
        ? error.message
        : "Request failed";

    return {
      userMessage: fallbackUserMessage,
      technicalMessage,
    };
  }

  if (error instanceof Error) {
    return {
      userMessage: fallbackUserMessage,
      technicalMessage: error.message,
    };
  }

  return {
    userMessage: fallbackUserMessage,
    technicalMessage: "Request failed",
  };
}

export function formatUserErrorMessage(normalized: NormalizedApiError) {
  if (normalized.requestId) {
    return `${normalized.userMessage} (Ref: ${normalized.requestId})`;
  }

  return normalized.userMessage;
}

export function logApiError(
  context: string,
  normalized: NormalizedApiError,
  extra?: Record<string, unknown>,
  eventName = "api:error",
) {
  const payload = {
    context,
    userMessage: normalized.userMessage,
    technicalMessage: normalized.technicalMessage,
    requestId: normalized.requestId,
    status: normalized.status,
    ...extra,
  };

  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
  }

  console.error(eventName, payload);
}
