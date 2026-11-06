import {
  defineAttachmentSource,
  defineRpc,
  type PluginAttachmentItem,
  PluginAttachmentSearchPayloadSchema,
} from "@getpaseo/plugin";
import { z } from "zod";

export const SavedPromptSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  text: z.string(),
  version: z.number().optional(),
  url: z.url(),
});

export type SavedPrompt = z.infer<typeof SavedPromptSchema>;

export const searchPromptsRpc = defineRpc({
  name: "prompts.search",
  input: z.object({ query: z.string() }),
  output: PluginAttachmentSearchPayloadSchema,
});

export const listPromptsRpc = defineRpc({
  name: "prompts.list",
  input: z.object({}),
  output: z.object({
    mode: z.enum(["local", "langfuse"]),
    prompts: z.array(SavedPromptSchema),
  }),
});

export const testLangfuseRpc = defineRpc({
  name: "prompts.langfuse.test",
  input: z.object({}),
  output: z.object({ projectName: z.string() }),
});

export const promptsSource = defineAttachmentSource({
  id: "saved-prompts",
  title: "Saved prompt",
  icon: "BookText",
  pickerTitle: "Attach saved prompt",
  searchPlaceholder: "Search prompts by name",
  search: searchPromptsRpc,
});

export function localPromptUrl(id: string): string {
  return `paseo-saved-prompts://local/${encodeURIComponent(id)}`;
}

export function toAttachmentItem(prompt: SavedPrompt, subtitle?: string): PluginAttachmentItem {
  return {
    id: prompt.id,
    identifier: prompt.name,
    title: prompt.name,
    subtitle,
    url: prompt.url,
    text: prompt.text,
    resourceType: "prompt",
  };
}
