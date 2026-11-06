import { describe, expect, it } from "vitest";
import { isConfigDirty } from "../shared/config-form";
import { ConfigSchema } from "../shared/settings";

const saved = ConfigSchema.parse({ langfuseBaseUrl: "https://lf.example.com" });

describe("isConfigDirty", () => {
  it("treats a draft that only differs by spaces the host trims as saved", () => {
    expect(isConfigDirty({ ...saved, langfuseBaseUrl: "https://lf.example.com " }, saved)).toBe(false);
  });

  it("reports a real change", () => {
    expect(isConfigDirty({ ...saved, mode: "langfuse" }, saved)).toBe(true);
  });

  it("reports a draft the schema rejects as unsaved", () => {
    expect(isConfigDirty({ ...saved, langfuseLabel: "  " }, saved)).toBe(true);
  });
});
