import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { darkColors, lightColors, space, type } from '@/src/ui/theme/tokens';
import { useColorScheme } from '@/hooks/useColorScheme';

export function ListRow({
  title,
  subtitle,
  left,
  right,
  onPress,
  style,
}: {
  title: string;
  subtitle?: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const c = isDark ? darkColors : lightColors;

  const content = (
    <View style={[styles.row, style]}>
      {!!left && <View style={styles.left}>{left}</View>}
      <View style={styles.mid}>
        <Text style={[styles.title, { color: c.onSurface }]} numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text style={[styles.subtitle, { color: c.onSurfaceMuted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {!!right && <View style={styles.right}>{right}</View>}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [{ opacity: pressed ? 0.86 : 1 }]}
      accessibilityRole="button"
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  left: {
    marginRight: space.md,
  },
  mid: {
    flex: 1,
    gap: 2,
  },
  right: {
    marginLeft: space.md,
  },
  title: {
    ...type.bodyMedium,
  },
  subtitle: {
    ...type.label,
  },
});

