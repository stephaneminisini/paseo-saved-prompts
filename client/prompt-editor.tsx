import type { PluginTheme } from "@getpaseo/plugin";
import type { SettingsState } from "@getpaseo/plugin/client";
import { Modal, TextInput } from "@getpaseo/plugin/client/ui";
import { useState } from "react";
import { Text, View } from "react-native";
import {
  deletePrompt,
  type PromptDraft,
  upsertPrompt,
  validatePromptDraft,
} from "../shared/local-prompts";
import { type LocalPrompt, localPromptsSettings } from "../shared/settings";
import { ActionButton } from "./action-button";

type ReadyState = Extract<SettingsState<typeof localPromptsSettings.schema>, { status: "ready" }>;

export interface PromptEditorProps {
  theme: PluginTheme;
  settings: ReadyState;
  /** The prompt being edited, or null for a new one. */
  editing: LocalPrompt | null;
  onClose(saved: boolean): void;
}

function newPromptId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PromptEditor({ theme, settings, editing, onClose }: PromptEditorProps) {
  const { colors } = theme;
  // Keep the revision from when the editor opened so a concurrent save becomes a conflict.
  const [revision] = useState(settings.revision);
  const [draft, setDraft] = useState<PromptDraft>({
    name: editing?.name ?? "",
    description: editing?.description ?? "",
    text: editing?.text ?? "",
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const prompts = settings.values.prompts;

  async function save() {
    const problems = validatePromptDraft(draft, prompts, editing?.id ?? null);
    setErrors(problems);
    if (problems.length > 0) return;
    const next = upsertPrompt(prompts, draft, {
      editingId: editing?.id ?? null,
      newId: newPromptId(),
      now: new Date().toISOString(),
    });
    if (await settings.save({ prompts: next }, revision)) onClose(true);
  }

  async function remove() {
    if (!editing) return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    if (await settings.save({ prompts: deletePrompt(prompts, editing.id) }, revision)) onClose(true);
  }

  const inputStyle = {
    color: colors.foreground,
    backgroundColor: colors.surface1,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
  };
  const label = { color: colors.foregroundMuted };

  return (
    <Modal
      title={editing ? `Edit ${editing.name}` : "New prompt"}
      open
      onOpenChange={(open) => {
        if (!open) onClose(false);
      }}
    >
      <Modal.Content>
        <View style={{ gap: 6 }}>
          <Text style={label}>Name</Text>
          <TextInput
            accessibilityLabel="Prompt name"
            value={draft.name}
            onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
            style={inputStyle}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={label}>Description (optional)</Text>
          <TextInput
            accessibilityLabel="Prompt description"
            value={draft.description}
            onChangeText={(description) => setDraft((current) => ({ ...current, description }))}
            style={inputStyle}
          />
        </View>
        <View style={{ gap: 6 }}>
          <Text style={label}>Prompt</Text>
          <TextInput
            accessibilityLabel="Prompt text"
            value={draft.text}
            multiline
            textAlignVertical="top"
            onChangeText={(text) => setDraft((current) => ({ ...current, text }))}
            style={[inputStyle, { minHeight: 200 }]}
          />
        </View>
        {[...errors, ...(settings.saveError ? [settings.saveError] : [])].map((message) => (
          <Text key={message} style={{ color: colors.statusDanger }}>
            {message}
          </Text>
        ))}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <ActionButton
            label="Save"
            variant="primary"
            theme={theme}
            disabled={settings.saving}
            onPress={() => void save()}
          />
          <ActionButton label="Cancel" theme={theme} onPress={() => onClose(false)} />
          {editing ? (
            <ActionButton
              label={confirmingDelete ? "Confirm delete" : "Delete"}
              variant="danger"
              theme={theme}
              disabled={settings.saving}
              onPress={() => void remove()}
            />
          ) : null}
        </View>
      </Modal.Content>
    </Modal>
  );
}
