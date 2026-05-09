import { StyleSheet, Text, type TextProps } from 'react-native';

import { useThemeColor } from '@/hooks/useThemeColor';
import { type as typeScale } from '@/src/ui/theme/tokens';

export type ThemedTextProps = TextProps & {
  lightColor?: string;
  darkColor?: string;
  type?: 'default' | 'title' | 'defaultSemiBold' | 'subtitle' | 'link';
};

export function ThemedText({
  style,
  lightColor,
  darkColor,
  type = 'default',
  ...rest
}: ThemedTextProps) {
  const color = useThemeColor({ light: lightColor, dark: darkColor }, 'text');

  return (
    <Text
      style={[
        { color },
        type === 'default' ? styles.default : undefined,
        type === 'title' ? styles.title : undefined,
        type === 'defaultSemiBold' ? styles.defaultSemiBold : undefined,
        type === 'subtitle' ? styles.subtitle : undefined,
        type === 'link' ? styles.link : undefined,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  default: {
    lineHeight: 24,
    ...typeScale.body,
  },
  defaultSemiBold: {
    lineHeight: 24,
    ...typeScale.bodyMedium,
  },
  title: {
    lineHeight: 32,
    ...typeScale.display,
  },
  subtitle: {
    ...typeScale.titleMedium,
  },
  link: {
    lineHeight: 30,
    color: '#0a7ea4',
    ...typeScale.bodyMedium,
  },
});
