import { z } from "zod";
import type { SavedPrompt } from "../shared/prompts";
import type { LangfuseKeys } from "./key-file";

export type LangfuseErrorKind = "config" | "auth" | "http" | "network" | "invalid-response";

/** A failed Langfuse call. Messages never include key values. */
export class LangfuseError extends Error {
  constructor(
    public readonly kind: LangfuseErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "LangfuseError";
  }
}

export interface LangfuseClient {
  /** Lists every prompt version carrying `label` whose type is "text". */
  listTextPrompts(label: string): Promise<SavedPrompt[]>;
  testConnection(): Promise<{ projectName: string }>;
}

export interface LangfuseClientOptions {
  baseUrl: string;
  keys: LangfuseKeys;
  fetchImpl?: typeof fetch;
}

const PAGE_LIMIT = 50;
const DETAIL_CONCURRENCY = 5;

const ProjectsSchema = z.object({
  data: z.array(z.object({ id: z.string(), name: z.string() })).min(1),
});
const PromptListSchema = z.object({
  data: z.array(z.object({ name: z.string() })),
  meta: z.object({ page: z.number(), totalPages: z.number() }),
});
const PromptSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), name: z.string(), version: z.number(), prompt: z.string() }),
  z.object({ type: z.literal("chat"), name: z.string(), version: z.number() }),
]);

/**
 * Creates a client for the Langfuse public REST API.
 *
 * Every method rejects with {@link LangfuseError}: kind "config" for an empty base URL,
 * "auth" for HTTP 401/403, "http" for other non-2xx statuses, "network" when the server
 * cannot be reached, and "invalid-response" when a body fails validation.
 */
export function createLangfuseClient(options: LangfuseClientOptions): LangfuseClient {
  const baseUrl = options.baseUrl.trim().replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const authorization = `Basic ${Buffer.from(
    `${options.keys.publicKey}:${options.keys.secretKey}`,
  ).toString("base64")}`;

  async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    if (baseUrl.length === 0) {
      throw new LangfuseError("config", "Set the Langfuse base URL in plugin settings.");
    }
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        headers: { authorization, accept: "application/json" },
      });
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new LangfuseError("network", `Cannot reach Langfuse at ${baseUrl}: ${reason}.`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new LangfuseError(
        "auth",
        `Langfuse rejected the keys (HTTP ${response.status}).`,
        response.status,
      );
    }
    if (!response.ok) {
      throw new LangfuseError(
        "http",
        `Langfuse request failed (HTTP ${response.status}).`,
        response.status,
      );
    }
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      console.error("[saved-prompts] Unexpected Langfuse response", {
        path,
        issues: parsed.error.issues,
      });
      throw new LangfuseError("invalid-response", "Langfuse returned an unexpected response.");
    }
    return parsed.data;
  }

  async function firstProject(): Promise<{ id: string; name: string }> {
    const { data } = await getJson("/api/public/projects", ProjectsSchema);
    const [project] = data;
    if (!project) throw new LangfuseError("invalid-response", "Langfuse returned no project.");
    return project;
  }

  async function listNames(label: string): Promise<string[]> {
    const names: string[] = [];
    for (let page = 1; ; page += 1) {
      const query = new URLSearchParams({ label, page: String(page), limit: String(PAGE_LIMIT) });
      const result = await getJson(`/api/public/v2/prompts?${query}`, PromptListSchema);
      names.push(...result.data.map((prompt) => prompt.name));
      if (page >= result.meta.totalPages || result.data.length === 0) return names;
    }
  }

  /** Fetches one prompt; null when it was deleted after it was listed. */
  async function fetchPrompt(name: string, label: string): Promise<z.infer<typeof PromptSchema> | null> {
    try {
      return await getJson(
        `/api/public/v2/prompts/${encodeURIComponent(name)}?${new URLSearchParams({ label })}`,
        PromptSchema,
      );
    } catch (error) {
      if (error instanceof LangfuseError && error.status === 404) return null;
      throw error;
    }
  }

  async function fetchPrompts(names: string[], label: string) {
    const results: Array<z.infer<typeof PromptSchema> | null> = new Array(names.length).fill(null);
    let next = 0;
    async function worker() {
      while (next < names.length) {
        const index = next;
        next += 1;
        results[index] = await fetchPrompt(names[index] as string, label);
      }
    }
    await Promise.all(Array.from({ length: Math.min(DETAIL_CONCURRENCY, names.length) }, worker));
    return results;
  }

  return {
    async listTextPrompts(label) {
      const project = await firstProject();
      const names = await listNames(label);
      const prompts = await fetchPrompts(names, label);
      return prompts.flatMap((prompt): SavedPrompt[] =>
        prompt?.type === "text"
          ? [
              {
                id: `${prompt.name}@${prompt.version}`,
                name: prompt.name,
                text: prompt.prompt,
                version: prompt.version,
                url: `${baseUrl}/project/${encodeURIComponent(project.id)}/prompts/${encodeURIComponent(prompt.name)}`,
              },
            ]
          : [],
      );
    },
    async testConnection() {
      const project = await firstProject();
      return { projectName: project.name };
    },
  };
}
