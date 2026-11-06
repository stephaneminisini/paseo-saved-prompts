import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import { Modal, ScrollView } from "@getpaseo/plugin/client/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Text, View } from "react-native";
import { listPromptsRpc, type SavedPrompt } from "../shared/prompts";
import { configSettings, type LocalPrompt, localPromptsSettings } from "../shared/settings";
import { ActionButton } from "./action-button";
import { PromptEditor } from "./prompt-editor";
import { PromptList } from "./prompt-list";

export interface PromptsScreenOptions {
  openSettings(): void;
}

type EditorTarget = { kind: "new" } | { kind: "edit"; prompt: LocalPrompt };

/** Builds the Prompts screen; the factory supplies client-context capabilities. */
export function createPromptsScreen({ openSettings }: PromptsScreenOptions) {
  return function PromptsScreen({ theme, layout, host }: PluginScreenProps) {
    const { colors } = theme;
    const config = useSettings(configSettings);
    const localPrompts = useSettings(localPromptsSettings);
    const listPrompts = useRpc(listPromptsRpc);
    const queryClient = useQueryClient();
    const mode = config.status === "ready" ? config.values.mode : null;
    const label = config.status === "ready" ? config.values.langfuseLabel : "";
    const query = useQuery({
      queryKey: ["prompts", mode, label, localPrompts.status === "ready" ? localPrompts.revision : null],
      queryFn: () => listPrompts({}),
      enabled: mode !== null,
    });
    const [editor, setEditor] = useState<EditorTarget | null>(null);
    const [preview, setPreview] = useState<SavedPrompt | null>(null);

    const padding = layout.compact ? 16 : 24;
    const text = { color: colors.foreground };
    const muted = { color: colors.foregroundMuted };

    function select(prompt: SavedPrompt) {
      if (mode !== "local" || localPrompts.status !== "ready") {
        setPreview(prompt);
        return;
      }
      const stored = localPrompts.values.prompts.find((candidate) => candidate.id === prompt.id);
      if (stored) setEditor({ kind: "edit", prompt: stored });
    }

    function closeEditor(saved: boolean) {
      setEditor(null);
      if (saved) void queryClient.invalidateQueries({ queryKey: ["prompts"] });
    }

    let body;
    if (config.status === "loading" || mode === null || query.isPending) {
      body = <Text style={muted}>Loading prompts…</Text>;
    } else if (config.status === "error" || config.status === "invalid") {
      body = <Text style={text}>{config.error}</Text>;
    } else if (query.isError) {
      body = (
        <View style={{ gap: 12 }}>
          <Text style={text}>{query.error.message}</Text>
          <View style={{ flexDirection: "row" }}>
            <ActionButton label="Retry" theme={theme} onPress={() => void query.refetch()} />
          </View>
        </View>
      );
    } else if (query.data.prompts.length === 0) {
      body = (
        <Text style={muted}>
          {mode === "local" ? "No saved prompts yet." : `No text prompts with label ${label}.`}
        </Text>
      );
    } else {
      body = (
        <PromptList
          prompts={query.data.prompts}
          theme={theme}
          subtitle={(prompt) =>
            mode === "langfuse" ? `v${prompt.version} · ${label}` : prompt.description
          }
          onSelect={select}
        />
      );
    }

    return (
      <ScrollView
        style={{ flex: 1, backgroundColor: colors.surface0 }}
        contentContainerStyle={{ padding, gap: 16 }}
      >
        <View style={{ gap: 8 }}>
          <Text style={muted}>
            {mode === "langfuse" ? `Langfuse prompts (${label})` : `Local prompts on ${host.label}`}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {mode === "local" && localPrompts.status === "ready" ? (
              <ActionButton
                label="New prompt"
                variant="primary"
                theme={theme}
                onPress={() => setEditor({ kind: "new" })}
              />
            ) : null}
            {mode === "langfuse" ? (
              <ActionButton label="Refresh" theme={theme} onPress={() => void query.refetch()} />
            ) : null}
            <ActionButton label="Settings" theme={theme} onPress={openSettings} />
          </View>
        </View>
        {body}
        {editor && localPrompts.status === "ready" ? (
          <PromptEditor
            theme={theme}
            settings={localPrompts}
            editing={editor.kind === "edit" ? editor.prompt : null}
            onClose={closeEditor}
          />
        ) : null}
        {preview ? (
          <Modal
            title={preview.name}
            open
            onOpenChange={(open) => {
              if (!open) setPreview(null);
            }}
          >
            <Modal.Content>
              {preview.version !== undefined ? (
                <Text style={muted}>{`Version ${preview.version}`}</Text>
              ) : null}
              <Text style={text} selectable>
                {preview.text}
              </Text>
            </Modal.Content>
          </Modal>
        ) : null}
      </ScrollView>
    );
  };
}
