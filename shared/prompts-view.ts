import type { StorageMode } from "./settings";

export type ConfigView =
  | { status: "loading" }
  | { status: "error" | "invalid"; error: string }
  | { status: "ready"; mode: StorageMode; label: string };

export type QueryView =
  | { status: "pending" }
  | { status: "error"; message: string }
  | { status: "success"; count: number };

export type PromptsView =
  | { kind: "loading" }
  | { kind: "config-error"; message: string }
  | { kind: "query-error"; message: string }
  | { kind: "empty"; message: string }
  | { kind: "list" };

/** Decides what the Prompts screen body shows. Settings errors win over loading. */
export function resolvePromptsView(input: { config: ConfigView; query: QueryView }): PromptsView {
  const { config, query } = input;
  if (config.status === "loading") return { kind: "loading" };
  if (config.status !== "ready") return { kind: "config-error", message: config.error };
  if (query.status === "pending") return { kind: "loading" };
  if (query.status === "error") return { kind: "query-error", message: query.message };
  if (query.count === 0) {
    return {
      kind: "empty",
      message:
        config.mode === "local" ? "No saved prompts yet." : `No text prompts with label ${config.label}.`,
    };
  }
  return { kind: "list" };
}
