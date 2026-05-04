type TraceDetail = {
  at: string;
  source: string;
  data?: Record<string, unknown>;
};

export function emitAutosaveTrace(
  source: string,
  data?: Record<string, unknown>,
) {
  if (typeof window === "undefined") {
    return;
  }

  if (!import.meta.env.DEV) {
    return;
  }

  // Can be disabled at runtime in dev with localStorage flag.
  const disabled = window.localStorage.getItem("personTodoTrace") === "off";
  if (disabled) {
    return;
  }

  const detail: TraceDetail = {
    at: new Date().toISOString(),
    source,
    data,
  };

  window.dispatchEvent(new CustomEvent("person-todo:trace", { detail }));
}
