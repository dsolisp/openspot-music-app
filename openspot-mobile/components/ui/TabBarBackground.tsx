import React from 'react';
import { StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useColorScheme } from '@/hooks/useColorScheme';
import { darkColors, glass, lightColors } from '@/src/ui/theme/tokens';

export default function BlurTabBarBackground() {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const c = isDark ? darkColors : lightColors;

  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={glass.blur}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={[
          isDark ? 'rgba(5,6,10,0.55)' : 'rgba(255,255,255,0.35)',
          isDark ? 'rgba(5,6,10,0.78)' : 'rgba(255,255,255,0.66)',
        ]}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[styles.hairline, { backgroundColor: c.dividerHairline }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hairline: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
});

export function useBottomTabOverflow() {
  return useBottomTabBarHeight();
}
