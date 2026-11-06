import { describe, expect, it } from "vitest";
import { KeyFileError, type LangfuseKeys } from "../server/key-file";
import type { LangfuseClient } from "../server/langfuse";
import { createPromptService, type PromptServiceDeps } from "../server/prompt-service";
import type { SavedPrompt } from "../shared/prompts";
import { type Config, ConfigSchema, type LocalPrompt } from "../shared/settings";

function local(id: string, name: string, description?: string): LocalPrompt {
  return { id, name, description, text: `${name} text`, updatedAt: "2026-11-06T00:00:00.000Z" };
}

interface Calls {
  keyPaths: string[];
  labels: string[];
}

function deps(options: {
  config?: Partial<Config>;
  locals?: LocalPrompt[];
  remote?: SavedPrompt[];
  readKeys?: (path: string) => Promise<LangfuseKeys>;
}): { deps: PromptServiceDeps; calls: Calls } {
  const calls: Calls = { keyPaths: [], labels: [] };
  const client: LangfuseClient = {
    async listTextPrompts(label) {
      calls.labels.push(label);
      return options.remote ?? [];
    },
    async testConnection() {
      return { projectName: "Acme" };
    },
  };
  return {
    calls,
    deps: {
      readConfig: async () => ConfigSchema.parse(options.config ?? {}),
      readLocalPrompts: async () => options.locals ?? [],
      readKeys:
        options.readKeys ??
        (async (path) => {
          calls.keyPaths.push(path);
          return { publicKey: "pk", secretKey: "sk" };
        }),
      createLangfuse: () => client,
    },
  };
}

describe("search in local mode", () => {
  it("keeps prompts whose name contains the query, ignoring case", async () => {
    const { deps: d } = deps({
      locals: [local("1", "Release"), local("2", "PR review", "Weekly")],
    });
    const { items } = await createPromptService(d).search("pr");
    expect(items).toEqual([
      {
        id: "2",
        identifier: "PR review",
        title: "PR review",
        subtitle: "Weekly",
        url: "paseo-saved-prompts://local/2",
        text: "PR review text",
        resourceType: "prompt",
      },
    ]);
  });

  it("returns every prompt sorted by name for an empty query", async () => {
    const { deps: d } = deps({ locals: [local("1", "triage"), local("2", "PR review")] });
    const { items } = await createPromptService(d).search("  ");
    expect(items.map((item) => item.title)).toEqual(["PR review", "triage"]);
  });

  it("returns at most 50 results", async () => {
    const locals = Array.from({ length: 60 }, (_, index) => local(String(index), `Prompt ${index}`));
    const { items } = await createPromptService(deps({ locals }).deps).search("prompt");
    expect(items).toHaveLength(50);
  });
});

describe("search in langfuse mode", () => {
  it("reads keys from the configured path and lists the configured label", async () => {
    const { deps: d, calls } = deps({
      config: { mode: "langfuse", langfuseBaseUrl: "https://lf.example.com", keyFilePath: "/k.env" },
      remote: [
        {
          id: "PR review@3",
          name: "PR review",
          text: "Review.",
          version: 3,
          url: "https://lf.example.com/project/p/prompts/PR%20review",
        },
      ],
    });
    const { items } = await createPromptService(d).search("review");
    expect(calls.keyPaths).toEqual(["/k.env"]);
    expect(calls.labels).toEqual(["production"]);
    expect(items[0]?.subtitle).toBe("v3 · production");
  });

  it("passes key file errors through unchanged", async () => {
    const failure = new KeyFileError("missing", "/k.env", "Langfuse key file not found at /k.env.");
    const { deps: d } = deps({
      config: { mode: "langfuse", langfuseBaseUrl: "https://lf.example.com" },
      readKeys: async () => {
        throw failure;
      },
    });
    await expect(createPromptService(d).search("")).rejects.toBe(failure);
  });
});

describe("list", () => {
  it("reports the active mode with the prompts", async () => {
    const { deps: d } = deps({ locals: [local("1", "Triage")] });
    const result = await createPromptService(d).list();
    expect(result.mode).toBe("local");
    expect(result.prompts.map((prompt) => prompt.name)).toEqual(["Triage"]);
  });
});

describe("testLangfuse", () => {
  it("tests the connection even while local mode is active", async () => {
    const { deps: d } = deps({ config: { langfuseBaseUrl: "https://lf.example.com" } });
    await expect(createPromptService(d).testLangfuse()).resolves.toEqual({ projectName: "Acme" });
  });
});
