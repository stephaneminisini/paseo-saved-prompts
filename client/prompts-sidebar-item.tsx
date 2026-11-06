import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";

export function PromptsSidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="BookText"
      active={currentScreen?.screenId === "prompts"}
      onPress={() => openScreen({ screenId: "prompts" })}
    />
  );
}
