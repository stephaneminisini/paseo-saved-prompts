import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/** Langfuse Cloud, EU region (the Langfuse SDK default). US region: https://us.cloud.langfuse.com */
export const DEFAULT_LANGFUSE_BASE_URL = "https://cloud.langfuse.com";
export const DEFAULT_KEY_FILE_PATH = "~/.config/paseo-saved-prompts/langfuse.env";

export const ConfigSchema = z.object({
  mode: z.enum(["local", "langfuse"]).default("local"),
  langfuseBaseUrl: z.string().trim().default(DEFAULT_LANGFUSE_BASE_URL),
  langfuseLabel: z.string().trim().min(1, "Enter a label").default("production"),
  keyFilePath: z.string().trim().min(1, "Enter the key file path").default(DEFAULT_KEY_FILE_PATH),
});

export type Config = z.infer<typeof ConfigSchema>;
export type StorageMode = Config["mode"];

export const configSettings = defineSettings({
  id: "config",
  scope: "host",
  version: 1,
  schema: ConfigSchema,
});

export const LocalPromptSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(200).optional(),
  text: z.string().refine((text) => text.trim().length > 0, "Enter the prompt text"),
  updatedAt: z.string(),
});

export type LocalPrompt = z.infer<typeof LocalPromptSchema>;

/** Compare prompt names the way users perceive them: case and surrounding spaces ignored. */
export function promptNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export const LocalPromptsSchema = z
  .object({ prompts: z.array(LocalPromptSchema).default([]) })
  .superRefine(({ prompts }, context) => {
    const seen = new Set<string>();
    prompts.forEach((prompt, index) => {
      const key = promptNameKey(prompt.name);
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          message: `Name is already used: ${prompt.name}`,
          path: ["prompts", index, "name"],
        });
      }
      seen.add(key);
    });
  });

export const localPromptsSettings = defineSettings({
  id: "local-prompts",
  scope: "host",
  version: 1,
  schema: LocalPromptsSchema,
});
