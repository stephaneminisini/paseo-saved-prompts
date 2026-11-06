import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  deletePrompt,
  type PromptDraft,
  upsertPrompt,
  validatePromptDraft,
} from "../shared/local-prompts";
import { type LocalPrompt, localPromptsSettings } from "../shared/settings";

const review: LocalPrompt = {
  id: "p1",
  name: "PR Review",
  text: "Review open PRs.",
  updatedAt: "2026-11-06T00:00:00.000Z",
};
const triage: LocalPrompt = {
  id: "p2",
  name: "Triage",
  description: "Sort new issues",
  text: "Triage issues.",
  updatedAt: "2026-11-06T00:00:00.000Z",
};

function draft(overrides: Partial<PromptDraft>): PromptDraft {
  return { name: "New", description: "", text: "Do it.", ...overrides };
}

describe("validatePromptDraft", () => {
  it("rejects a blank name", () => {
    expect(validatePromptDraft(draft({ name: "  " }), [], null)).toEqual(["Enter a name"]);
  });

  it("rejects blank prompt text", () => {
    expect(validatePromptDraft(draft({ text: "\n " }), [], null)).toEqual([
      "Enter the prompt text",
    ]);
  });

  it("rejects a name that matches another prompt ignoring case and spaces", () => {
    expect(validatePromptDraft(draft({ name: " pr review " }), [review], null)).toEqual([
      "Name is already used",
    ]);
  });

  it("accepts the same name when editing that prompt", () => {
    expect(validatePromptDraft(draft({ name: "PR Review" }), [review], "p1")).toEqual([]);
  });
});

describe("upsertPrompt", () => {
  it("appends a new prompt with the given id and timestamp", () => {
    const result = upsertPrompt([review], draft({ name: " Release ", text: "  Ship it\n" }), {
      editingId: null,
      newId: "p9",
      now: "2026-11-07T00:00:00.000Z",
    });
    expect(result).toEqual([
      review,
      {
        id: "p9",
        name: "Release",
        description: undefined,
        text: "  Ship it\n",
        updatedAt: "2026-11-07T00:00:00.000Z",
      },
    ]);
  });

  it("replaces an edited prompt in place and drops an empty description", () => {
    const result = upsertPrompt(
      [review, triage],
      draft({ name: "Triage", description: "   ", text: "New text" }),
      { editingId: "p2", newId: "unused", now: "2026-11-07T00:00:00.000Z" },
    );
    expect(result).toEqual([
      review,
      {
        id: "p2",
        name: "Triage",
        description: undefined,
        text: "New text",
        updatedAt: "2026-11-07T00:00:00.000Z",
      },
    ]);
  });
});

describe("saving through the host", () => {
  // The host parses with the schema, then requires plain JSON (z.json), which rejects undefined.
  it("stores a prompt without a description as valid JSON", () => {
    const prompts = upsertPrompt([], draft({ name: "Open PRs", description: "" }), {
      editingId: null,
      newId: "p1",
      now: "2026-11-06T00:00:00.000Z",
    });
    const parsed = localPromptsSettings.schema.parse({ prompts });
    expect(z.json().safeParse(parsed).success).toBe(true);
  });
});

describe("deletePrompt", () => {
  it("removes only the matching prompt", () => {
    expect(deletePrompt([review, triage], "p1")).toEqual([triage]);
  });
});

describe("localPromptsSettings schema", () => {
  it("rejects two prompts whose names differ only by case and spaces", () => {
    const result = localPromptsSettings.schema.safeParse({
      prompts: [triage, { ...review, id: "p3", name: " triage" }],
    });
    expect(result.success).toBe(false);
  });

  it("parses an empty document to an empty prompt list", () => {
    expect(localPromptsSettings.schema.parse({})).toEqual({ prompts: [] });
  });
});
