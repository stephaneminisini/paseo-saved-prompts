import type { PluginAttachmentSearchPayload } from "@getpaseo/plugin";
import { localPromptUrl, type SavedPrompt, toAttachmentItem } from "../shared/prompts";
import type { Config, LocalPrompt, StorageMode } from "../shared/settings";
import type { LangfuseKeys } from "./key-file";
import type { LangfuseClient } from "./langfuse";

const MAX_SEARCH_RESULTS = 50;
/** How long a Langfuse list is reused, so picker keystrokes do not refetch every prompt. */
const LANGFUSE_CACHE_MS = 60_000;

/** Thrown when a settings document is stored but fails its schema. */
export class SettingsUnavailableError extends Error {
  constructor(detail: string) {
    super(`Saved Prompts settings are invalid: ${detail}`);
    this.name = "SettingsUnavailableError";
  }
}

export interface PromptServiceDeps {
  readConfig(): Promise<Config>;
  readLocalPrompts(): Promise<LocalPrompt[]>;
  readKeys(path: string): Promise<LangfuseKeys>;
  createLangfuse(options: { baseUrl: string; keys: LangfuseKeys }): LangfuseClient;
  /** Milliseconds clock; defaults to Date.now. */
  now?(): number;
}

export interface ListOptions {
  /** Bypass the Langfuse cache. */
  fresh?: boolean;
}

export interface PromptList {
  mode: StorageMode;
  prompts: SavedPrompt[];
}

export interface PromptService {
  list(options?: ListOptions): Promise<PromptList>;
  search(query: string): Promise<PluginAttachmentSearchPayload>;
  testLangfuse(): Promise<{ projectName: string }>;
}

function byName(a: SavedPrompt, b: SavedPrompt): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Serves prompts from the active storage mode.
 *
 * Errors from the deps (KeyFileError, LangfuseError, SettingsUnavailableError) propagate
 * unchanged so their messages reach the user.
 */
export function createPromptService(deps: PromptServiceDeps): PromptService {
  const now = deps.now ?? Date.now;
  let cache: { key: string; at: number; prompts: SavedPrompt[] } | null = null;

  async function langfuseFor(config: Config): Promise<LangfuseClient> {
    const keys = await deps.readKeys(config.keyFilePath);
    return deps.createLangfuse({ baseUrl: config.langfuseBaseUrl, keys });
  }

  async function load(fresh = false): Promise<{ config: Config; prompts: SavedPrompt[] }> {
    const config = await deps.readConfig();
    if (config.mode === "langfuse") {
      const key = [config.langfuseBaseUrl, config.langfuseLabel, config.keyFilePath].join("\n");
      if (!fresh && cache && cache.key === key && now() - cache.at < LANGFUSE_CACHE_MS) {
        return { config, prompts: cache.prompts };
      }
      const client = await langfuseFor(config);
      const prompts = [...(await client.listTextPrompts(config.langfuseLabel))].sort(byName);
      cache = { key, at: now(), prompts };
      return { config, prompts };
    }
    const locals = await deps.readLocalPrompts();
    const prompts = locals.map(
      (prompt): SavedPrompt => ({
        id: prompt.id,
        name: prompt.name,
        description: prompt.description,
        text: prompt.text,
        url: localPromptUrl(prompt.id),
      }),
    );
    return { config, prompts: prompts.sort(byName) };
  }

  return {
    async list(options = {}) {
      const { config, prompts } = await load(options.fresh);
      return { mode: config.mode, prompts };
    },
    async search(query) {
      const { config, prompts } = await load();
      const needle = query.trim().toLowerCase();
      const items = prompts
        .filter((prompt) => prompt.name.toLowerCase().includes(needle))
        .slice(0, MAX_SEARCH_RESULTS)
        .map((prompt) =>
          toAttachmentItem(
            prompt,
            config.mode === "langfuse"
              ? `v${prompt.version} · ${config.langfuseLabel}`
              : prompt.description,
          ),
        );
      return { items };
    },
    async testLangfuse() {
      const config = await deps.readConfig();
      const client = await langfuseFor(config);
      return client.testConnection();
    },
  };
}
