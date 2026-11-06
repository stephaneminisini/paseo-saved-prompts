import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createLangfuseClient, LangfuseError } from "../server/langfuse";

const KEYS = { publicKey: "pk", secretKey: "sk" };

interface SeenRequest {
  path: string;
  label: string | null;
  authorization: string | undefined;
}

type Handler = (url: URL, response: ServerResponse) => void;

const servers: Array<{ close(): void }> = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function startServer(handler: Handler): Promise<{ baseUrl: string; seen: SeenRequest[] }> {
  const seen: SeenRequest[] = [];
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    seen.push({
      path: request.url?.split("?")[0] ?? "",
      label: url.searchParams.get("label"),
      authorization: request.headers.authorization,
    });
    handler(url, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, seen };
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const PROMPTS: Record<string, unknown> = {
  "PR review": { name: "PR review", version: 3, type: "text", prompt: "Review open PRs." },
  "release / hotfix": {
    name: "release / hotfix",
    version: 1,
    type: "text",
    prompt: "Prepare the hotfix.",
  },
  "triage-chat": {
    name: "triage-chat",
    version: 2,
    type: "chat",
    prompt: [{ role: "system", content: "Triage." }],
  },
};

function langfuseStub(url: URL, response: ServerResponse): void {
  if (url.pathname === "/api/public/projects") {
    json(response, 200, { data: [{ id: "proj-1", name: "Acme" }] });
    return;
  }
  if (url.pathname === "/api/public/v2/prompts") {
    const page = Number(url.searchParams.get("page"));
    const names = page === 1 ? ["PR review", "triage-chat"] : ["release / hotfix"];
    json(response, 200, {
      data: names.map((name) => ({ name })),
      meta: { page, limit: 50, totalItems: 3, totalPages: 2 },
    });
    return;
  }
  const name = decodeURIComponent(url.pathname.replace("/api/public/v2/prompts/", ""));
  const prompt = PROMPTS[name];
  if (prompt) json(response, 200, prompt);
  else json(response, 404, { message: "not found" });
}

async function rejection(promise: Promise<unknown>): Promise<LangfuseError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(LangfuseError);
  return error as LangfuseError;
}

describe("listTextPrompts", () => {
  it("lists text prompts across pages and skips chat prompts", async () => {
    const { baseUrl, seen } = await startServer(langfuseStub);
    const prompts = await createLangfuseClient({ baseUrl, keys: KEYS }).listTextPrompts(
      "production",
    );
    expect(prompts).toEqual([
      {
        id: "PR review@3",
        name: "PR review",
        text: "Review open PRs.",
        version: 3,
        url: `${baseUrl}/project/proj-1/prompts/PR%20review`,
      },
      {
        id: "release / hotfix@1",
        name: "release / hotfix",
        text: "Prepare the hotfix.",
        version: 1,
        url: `${baseUrl}/project/proj-1/prompts/release%20%2F%20hotfix`,
      },
    ]);
    const promptRequests = seen.filter((request) => request.path.startsWith("/api/public/v2/"));
    expect(promptRequests.every((request) => request.label === "production")).toBe(true);
    expect(seen.map((request) => request.path)).toContain(
      "/api/public/v2/prompts/release%20%2F%20hotfix",
    );
    expect(seen[0]?.authorization).toBe(`Basic ${Buffer.from("pk:sk").toString("base64")}`);
  });

  it("builds the same request paths when the base url ends with a slash", async () => {
    const { baseUrl, seen } = await startServer(langfuseStub);
    await createLangfuseClient({ baseUrl: `${baseUrl}/`, keys: KEYS }).listTextPrompts(
      "production",
    );
    expect(seen.every((request) => !request.path.startsWith("//"))).toBe(true);
    expect(seen.map((request) => request.path)).toContain("/api/public/v2/prompts");
  });

  it("rejects an empty base url without making a request", async () => {
    const error = await rejection(
      createLangfuseClient({ baseUrl: "  ", keys: KEYS }).listTextPrompts("production"),
    );
    expect(error.kind).toBe("config");
    expect(error.message).toBe("Set the Langfuse base URL in plugin settings.");
  });

  it("reports rejected keys", async () => {
    const { baseUrl } = await startServer((_url, response) => json(response, 401, {}));
    const error = await rejection(
      createLangfuseClient({ baseUrl, keys: KEYS }).listTextPrompts("production"),
    );
    expect(error.kind).toBe("auth");
    expect(error.status).toBe(401);
  });

  it("reports other http failures", async () => {
    const { baseUrl } = await startServer((_url, response) => json(response, 500, {}));
    const error = await rejection(
      createLangfuseClient({ baseUrl, keys: KEYS }).listTextPrompts("production"),
    );
    expect(error.kind).toBe("http");
    expect(error.status).toBe(500);
  });

  it("reports an unexpected response shape", async () => {
    const { baseUrl } = await startServer((url, response) =>
      url.pathname === "/api/public/projects"
        ? json(response, 200, { data: [{ id: "proj-1", name: "Acme" }] })
        : json(response, 200, { data: "nope" }),
    );
    const error = await rejection(
      createLangfuseClient({ baseUrl, keys: KEYS }).listTextPrompts("production"),
    );
    expect(error.kind).toBe("invalid-response");
  });

  it("reports an unreachable server", async () => {
    const { baseUrl } = await startServer(langfuseStub);
    for (const server of servers.splice(0)) server.close();
    const error = await rejection(
      createLangfuseClient({ baseUrl, keys: KEYS }).listTextPrompts("production"),
    );
    expect(error.kind).toBe("network");
  });
});

describe("testConnection", () => {
  it("returns the first project's name", async () => {
    const { baseUrl } = await startServer(langfuseStub);
    await expect(createLangfuseClient({ baseUrl, keys: KEYS }).testConnection()).resolves.toEqual({
      projectName: "Acme",
    });
  });
});

describe("listTextPrompts resilience", () => {
  it("skips a prompt deleted between listing and fetching it", async () => {
    const { baseUrl } = await startServer((url, response) => {
      if (url.pathname === "/api/public/v2/prompts") {
        json(response, 200, {
          data: [{ name: "PR review" }, { name: "gone" }],
          meta: { page: 1, totalPages: 1 },
        });
        return;
      }
      langfuseStub(url, response);
    });
    const prompts = await createLangfuseClient({ baseUrl, keys: KEYS }).listTextPrompts(
      "production",
    );
    expect(prompts.map((prompt) => prompt.name)).toEqual(["PR review"]);
  });

  it("fetches at most five prompt details at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    const names = Array.from({ length: 12 }, (_, index) => `p${index}`);
    const { baseUrl } = await startServer((url, response) => {
      if (url.pathname === "/api/public/projects") {
        json(response, 200, { data: [{ id: "proj-1", name: "Acme" }] });
        return;
      }
      if (url.pathname === "/api/public/v2/prompts") {
        json(response, 200, { data: names.map((name) => ({ name })), meta: { page: 1, totalPages: 1 } });
        return;
      }
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const name = decodeURIComponent(url.pathname.split("/").pop() ?? "");
      setTimeout(() => {
        inFlight -= 1;
        json(response, 200, { name, version: 1, type: "text", prompt: name });
      }, 20);
    });
    const prompts = await createLangfuseClient({ baseUrl, keys: KEYS }).listTextPrompts(
      "production",
    );
    expect(prompts).toHaveLength(12);
    expect(peak).toBeLessThanOrEqual(5);
  });
});
