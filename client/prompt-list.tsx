import type { PluginTheme } from "@getpaseo/plugin";
import { Pressable, Text, View } from "react-native";
import type { SavedPrompt } from "../shared/prompts";

export interface PromptListProps {
  prompts: SavedPrompt[];
  theme: PluginTheme;
  /** Secondary line under each name. */
  subtitle(prompt: SavedPrompt): string | undefined;
  onSelect(prompt: SavedPrompt): void;
}

export function PromptList({ prompts, theme, subtitle, onSelect }: PromptListProps) {
  const { colors } = theme;
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10 }}>
      {prompts.map((prompt, index) => {
        const secondary = subtitle(prompt);
        return (
          <Pressable
            key={prompt.id}
            accessibilityRole="button"
            accessibilityLabel={`Open prompt ${prompt.name}`}
            onPress={() => onSelect(prompt)}
            style={{
              padding: 12,
              gap: 2,
              borderTopWidth: index === 0 ? 0 : 1,
              borderTopColor: colors.border,
              backgroundColor: colors.surface1,
            }}
          >
            <Text style={{ color: colors.foreground, fontWeight: "600" }}>{prompt.name}</Text>
            {secondary ? (
              <Text style={{ color: colors.foregroundMuted }} numberOfLines={1}>
                {secondary}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
