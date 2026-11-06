import type { PluginClientContext } from "@getpaseo/plugin/client";
import { createPromptsScreen } from "./client/prompts-screen";
import { PromptsSidebarItem } from "./client/prompts-sidebar-item";
import { SettingsScreen } from "./client/settings-screen";
import { promptsSource } from "./shared/prompts";

export default function contribute(client: PluginClientContext) {
  client.addAttachmentSource(promptsSource);
  client.addSettingsScreen({
    id: "config",
    title: "Storage",
    icon: "Database",
    Component: SettingsScreen,
  });
  client.addScreen({
    id: "prompts",
    title: "Prompts",
    Component: createPromptsScreen({ openSettings: () => client.openSettings("config") }),
  });
  client.addSidebarHeaderItem({ id: "prompts", title: "Prompts", Component: PromptsSidebarItem });
  return () => {};
}
