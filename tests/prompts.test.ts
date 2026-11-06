import { PluginAttachmentItemSchema } from "@getpaseo/plugin";
import { describe, expect, it } from "vitest";
import { localPromptUrl, toAttachmentItem } from "../shared/prompts";
import { configSettings } from "../shared/settings";

describe("toAttachmentItem", () => {
  it("produces a valid attachment item for a local prompt url", () => {
    const item = toAttachmentItem(
      { id: "a b/c", name: "PR review", text: "Review PRs.", url: localPromptUrl("a b/c") },
      "Weekly review",
    );
    expect(PluginAttachmentItemSchema.parse(item)).toEqual({
      id: "a b/c",
      identifier: "PR review",
      title: "PR review",
      subtitle: "Weekly review",
      url: localPromptUrl("a b/c"),
      text: "Review PRs.",
      resourceType: "prompt",
    });
  });
});

describe("configSettings", () => {
  it("defaults to local storage with the production label", () => {
    expect(configSettings.schema.parse({})).toEqual({
      mode: "local",
      langfuseBaseUrl: "",
      langfuseLabel: "production",
      keyFilePath: "~/.config/paseo-saved-prompts/langfuse.env",
    });
  });
});
