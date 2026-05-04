// Re-export from the generic listToList error handling utilities.
// Domain callers that previously imported from here continue to work unchanged.
export type { NormalizedApiError } from "../listToList/errorHandling";
export {
  formatUserErrorMessage,
  logApiError,
  normalizeApiError,
} from "../listToList/errorHandling";
