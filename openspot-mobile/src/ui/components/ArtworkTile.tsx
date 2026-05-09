import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { darkColors, lightColors, radii } from '@/src/ui/theme/tokens';
import { useColorScheme } from '@/hooks/useColorScheme';

export function ArtworkTile({
  uri,
  size = 56,
  style,
}: {
  uri?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const c = isDark ? darkColors : lightColors;

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radii.sm,
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : c.surfaceContainer,
        },
        style,
      ]}
    >
      {!!uri && (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radii.sm }}
          contentFit="cover"
          transition={120}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
});

