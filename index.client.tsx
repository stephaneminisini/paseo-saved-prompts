import type { PluginClientContext } from "@getpaseo/plugin/client";
import { promptsSource } from "./shared/prompts";

export default function contribute(client: PluginClientContext) {
  client.addAttachmentSource(promptsSource);
  return () => {};
}
