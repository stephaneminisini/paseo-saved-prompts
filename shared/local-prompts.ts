import { type LocalPrompt, promptNameKey } from "./settings";

export interface PromptDraft {
  name: string;
  description: string;
  text: string;
}

export interface UpsertOptions {
  /** Id of the prompt being edited, or null to add a new one. */
  editingId: string | null;
  newId: string;
  now: string;
}

/** Returns user-facing validation messages; an empty array means the draft can be saved. */
export function validatePromptDraft(
  draft: PromptDraft,
  existing: LocalPrompt[],
  editingId: string | null,
): string[] {
  const errors: string[] = [];
  const key = promptNameKey(draft.name);
  if (key.length === 0) {
    errors.push("Enter a name");
  } else if (existing.some((prompt) => prompt.id !== editingId && promptNameKey(prompt.name) === key)) {
    errors.push("Name is already used");
  }
  if (draft.text.trim().length === 0) errors.push("Enter the prompt text");
  return errors;
}

export function upsertPrompt(
  prompts: LocalPrompt[],
  draft: PromptDraft,
  options: UpsertOptions,
): LocalPrompt[] {
  const description = draft.description.trim();
  const fields = {
    name: draft.name.trim(),
    description: description.length > 0 ? description : undefined,
    text: draft.text,
    updatedAt: options.now,
  };
  if (options.editingId === null) return [...prompts, { id: options.newId, ...fields }];
  return prompts.map((prompt) =>
    prompt.id === options.editingId ? { id: prompt.id, ...fields } : prompt,
  );
}

export function deletePrompt(prompts: LocalPrompt[], id: string): LocalPrompt[] {
  return prompts.filter((prompt) => prompt.id !== id);
}
