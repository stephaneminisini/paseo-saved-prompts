import { describe, expect, it } from "vitest";
import { resolvePromptsView } from "../shared/prompts-view";

describe("resolvePromptsView", () => {
  it("shows the settings error instead of loading when config is invalid", () => {
    expect(
      resolvePromptsView({
        config: { status: "invalid", error: "Expected string" },
        query: { status: "pending" },
      }),
    ).toEqual({ kind: "config-error", message: "Expected string" });
  });

  it("shows loading while config loads", () => {
    expect(
      resolvePromptsView({ config: { status: "loading" }, query: { status: "pending" } }),
    ).toEqual({ kind: "loading" });
  });

  it("shows the rpc error message", () => {
    expect(
      resolvePromptsView({
        config: { status: "ready", mode: "langfuse", label: "production" },
        query: { status: "error", message: "Langfuse rejected the keys (HTTP 401)." },
      }),
    ).toEqual({ kind: "query-error", message: "Langfuse rejected the keys (HTTP 401)." });
  });

  it("names the label when langfuse has no prompts", () => {
    expect(
      resolvePromptsView({
        config: { status: "ready", mode: "langfuse", label: "production" },
        query: { status: "success", count: 0 },
      }),
    ).toEqual({ kind: "empty", message: "No text prompts with label production." });
  });

  it("lists prompts when there are some", () => {
    expect(
      resolvePromptsView({
        config: { status: "ready", mode: "local", label: "production" },
        query: { status: "success", count: 2 },
      }),
    ).toEqual({ kind: "list" });
  });
});
