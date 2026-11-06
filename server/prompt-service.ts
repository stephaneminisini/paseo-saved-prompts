import type { PluginAttachmentSearchPayload } from "@getpaseo/plugin";
import { localPromptUrl, type SavedPrompt, toAttachmentItem } from "../shared/prompts";
import type { Config, LocalPrompt, StorageMode } from "../shared/settings";
import type { LangfuseKeys } from "./key-file";
import type { LangfuseClient } from "./langfuse";

const MAX_SEARCH_RESULTS = 50;

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
}

export interface PromptList {
  mode: StorageMode;
  prompts: SavedPrompt[];
}

export interface PromptService {
  list(): Promise<PromptList>;
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
  async function langfuseFor(config: Config): Promise<LangfuseClient> {
    const keys = await deps.readKeys(config.keyFilePath);
    return deps.createLangfuse({ baseUrl: config.langfuseBaseUrl, keys });
  }

  async function load(): Promise<{ config: Config; prompts: SavedPrompt[] }> {
    const config = await deps.readConfig();
    if (config.mode === "langfuse") {
      const client = await langfuseFor(config);
      const prompts = await client.listTextPrompts(config.langfuseLabel);
      return { config, prompts: [...prompts].sort(byName) };
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
    async list() {
      const { config, prompts } = await load();
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
