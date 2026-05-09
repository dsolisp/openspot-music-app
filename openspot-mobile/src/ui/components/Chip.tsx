import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';
import { darkColors, lightColors, radii, space, type } from '@/src/ui/theme/tokens';
import { useColorScheme } from '@/hooks/useColorScheme';

export function Chip({
  label,
  selected,
  onPress,
  style,
  textStyle,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const c = isDark ? darkColors : lightColors;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: selected ? c.surfaceGlassStrong : c.surfaceGlass,
          borderColor: selected ? c.neonPrimary : `rgba(255,255,255,0.16)`,
          opacity: pressed ? 0.86 : 1,
        },
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
    >
      <Text
        style={[
          styles.text,
          { color: selected ? c.neonPrimary : c.onSurfaceMuted },
          textStyle,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: space.md,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    ...type.label,
  },
});

