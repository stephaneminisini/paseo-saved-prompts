import type { PluginSurfaceProps, SettingsState } from "@getpaseo/plugin/client";
import { useRpc, useSettings } from "@getpaseo/plugin/client";
import {
  SettingsAction,
  SettingsCard,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsSelect,
} from "@getpaseo/plugin/client/ui";
import { useEffect, useState } from "react";
import { Text } from "react-native";
import { isConfigDirty } from "../shared/config-form";
import { testLangfuseRpc } from "../shared/prompts";
import { type Config, configSettings, type StorageMode } from "../shared/settings";

type ReadyConfig = Extract<SettingsState<typeof configSettings.schema>, { status: "ready" }>;

const MODES: ReadonlyArray<{ label: string; value: StorageMode }> = [
  { label: "Local", value: "local" },
  { label: "Langfuse", value: "langfuse" },
];

type TestState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "ok"; projectName: string }
  | { status: "failed"; message: string };

function StorageForm({ settings, theme }: { settings: ReadyConfig } & Pick<PluginSurfaceProps, "theme">) {
  // Keep the revision from when the form loaded so another client's save becomes a conflict.
  const [revision, setRevision] = useState(settings.revision);
  const [draft, setDraft] = useState<Config>(settings.values);
  const [test, setTest] = useState<TestState>({ status: "idle" });
  const testLangfuse = useRpc(testLangfuseRpc);
  const text = { color: theme.colors.foreground };

  function update(patch: Partial<Config>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  const dirty = isConfigDirty(draft, settings.values);
  // Adopt a newer revision once the saved values match the draft, as after our own save.
  useEffect(() => {
    if (!dirty) setRevision(settings.revision);
  }, [dirty, settings.revision]);

  async function save() {
    await settings.save(draft, revision);
  }

  async function runTest() {
    setTest({ status: "running" });
    try {
      const { projectName } = await testLangfuse({});
      setTest({ status: "ok", projectName });
    } catch (error) {
      setTest({ status: "failed", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <>
      <SettingsSection title="Storage">
        <SettingsCard>
          <SettingsSelect
            label="Prompt storage"
            hint="Local keeps prompts on this host. Langfuse reads them, read-only."
            value={draft.mode}
            options={MODES}
            disabled={settings.saving}
            onValueChange={(mode) => update({ mode })}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="Langfuse">
        <SettingsCard>
          <SettingsInput
            label="Base URL"
            hint="Langfuse Cloud EU by default. US: https://us.cloud.langfuse.com. Self-hosted: your instance URL."
            placeholder="https://cloud.langfuse.com"
            initialValue={draft.langfuseBaseUrl}
            disabled={settings.saving}
            onChangeText={(langfuseBaseUrl) => update({ langfuseBaseUrl })}
          />
          <SettingsInput
            label="Label"
            hint="The prompt version carrying this label is used."
            initialValue={draft.langfuseLabel}
            disabled={settings.saving}
            onChangeText={(langfuseLabel) => update({ langfuseLabel })}
          />
          <SettingsInput
            label="Key file path"
            hint="Path on the daemon machine."
            initialValue={draft.keyFilePath}
            disabled={settings.saving}
            onChangeText={(keyFilePath) => update({ keyFilePath })}
          />
          <SettingsRow
            label="Key file format"
            hint={`LANGFUSE_PUBLIC_KEY=pk-lf-...\nLANGFUSE_SECRET_KEY=sk-lf-...\nThen run: chmod 600 ${draft.keyFilePath}`}
          />
          <SettingsAction
            label="Test connection"
            hint="Uses the saved settings and the key file."
            actionLabel={test.status === "running" ? "Testing…" : "Test"}
            disabled={test.status === "running" || dirty}
            onPress={() => void runTest()}
          />
        </SettingsCard>
        {test.status === "ok" ? (
          <Text style={{ color: theme.colors.statusSuccess }}>{`Connected to ${test.projectName}`}</Text>
        ) : null}
        {test.status === "failed" ? (
          <Text accessibilityRole="alert" style={{ color: theme.colors.statusDanger }}>
            {test.message}
          </Text>
        ) : null}
      </SettingsSection>
      <SettingsCard>
        <SettingsAction
          label={dirty ? "Unsaved changes" : "All changes saved"}
          error={settings.saveError}
          actionLabel="Save"
          disabled={!dirty || settings.saving}
          onPress={() => void save()}
        />
      </SettingsCard>
      {settings.saveError ? <Text style={text}>Reload this page to see the latest settings.</Text> : null}
    </>
  );
}

export function SettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(configSettings);
  const text = { color: theme.colors.foreground };
  if (settings.status === "loading") return <Text style={text}>Loading settings…</Text>;
  if (settings.status !== "ready") {
    return (
      <SettingsSection title="Storage">
        <Text style={text}>{settings.error}</Text>
        <SettingsAction label="Try again" actionLabel="Reload" onPress={() => void settings.reload()} />
      </SettingsSection>
    );
  }
  return <StorageForm settings={settings} theme={theme} />;
}
