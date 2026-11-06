import type { PluginServerContext } from "@getpaseo/plugin/server";
import { readLangfuseKeys } from "./server/key-file";
import { createLangfuseClient } from "./server/langfuse";
import { createPromptService, SettingsUnavailableError } from "./server/prompt-service";
import { listPromptsRpc, searchPromptsRpc, testLangfuseRpc } from "./shared/prompts";
import { configSettings, localPromptsSettings } from "./shared/settings";

export default function contribute(server: PluginServerContext) {
  const config = server.registerSettings(configSettings);
  const localPrompts = server.registerSettings(localPromptsSettings);

  const service = createPromptService({
    async readConfig() {
      const state = await config.read();
      if (state.status !== "ready") throw new SettingsUnavailableError(state.error);
      return state.values;
    },
    async readLocalPrompts() {
      const state = await localPrompts.read();
      if (state.status !== "ready") throw new SettingsUnavailableError(state.error);
      return state.values.prompts;
    },
    readKeys: (path) => readLangfuseKeys(path),
    createLangfuse: (options) => createLangfuseClient(options),
  });

  server.handle(searchPromptsRpc, ({ query }) => service.search(query));
  server.handle(listPromptsRpc, () => service.list());
  server.handle(testLangfuseRpc, () => service.testLangfuse());
  return () => {};
}
