import React from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { darkColors, glass, glow, lightColors, radii, space } from '@/src/ui/theme/tokens';
import { useColorScheme } from '@/hooks/useColorScheme';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  blur?: number;
  padding?: number;
  neon?: 'primary' | 'secondary' | 'none';
};

export function GlassCard({ children, style, blur, padding, neon = 'none' }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const c = isDark ? darkColors : lightColors;
  const neonColor =
    neon === 'primary' ? c.neonPrimary : neon === 'secondary' ? c.neonSecondary : null;

  const base = (
    <View
      style={[
        styles.cardBase,
        {
          backgroundColor: c.surfaceGlass,
          borderColor: `rgba(255,255,255,${glass.borderAlpha})`,
          padding: padding ?? space.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );

  // Expo blur is nicer on iOS; on Android it can be expensive.
  // We still use it, but keep it subtle and provide a base fallback.
  if (Platform.OS === 'web') return base;

  return (
    <BlurView
      intensity={blur ?? glass.blur}
      tint={isDark ? 'dark' : 'light'}
      style={[
        styles.blurWrap,
        neonColor && {
          shadowColor: neonColor,
          shadowOpacity: glow.soft,
        },
      ]}
    >
      {base}
    </BlurView>
  );
}

const styles = StyleSheet.create({
  blurWrap: {
    borderRadius: radii.lg,
    overflow: 'hidden',
  },
  cardBase: {
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

