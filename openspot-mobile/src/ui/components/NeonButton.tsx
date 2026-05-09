import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, ViewStyle } from 'react-native';
import { darkColors, lightColors, radii, space, type } from '@/src/ui/theme/tokens';
import { useColorScheme } from '@/hooks/useColorScheme';

type Variant = 'primary' | 'secondary' | 'ghost';

export function NeonButton({
  title,
  onPress,
  variant = 'primary',
  style,
  textStyle,
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
}) {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const c = isDark ? darkColors : lightColors;

  const bg =
    variant === 'primary'
      ? c.neonPrimary
      : variant === 'secondary'
        ? c.neonSecondary
        : 'transparent';

  const border =
    variant === 'ghost' ? `rgba(255,255,255,0.18)` : 'transparent';

  const fg =
    variant === 'ghost' ? c.onSurface : '#051014';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          opacity: disabled ? 0.55 : pressed ? 0.86 : 1,
        },
        style,
      ]}
      accessibilityRole="button"
    >
      <Text style={[styles.text, { color: fg }, textStyle]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    ...type.bodyMedium,
  },
});

