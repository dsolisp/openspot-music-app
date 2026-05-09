/**
 * Design tokens — Material 3–aligned roles for OpenSpot (2026 refresh baseline).
 * Screens should consume these instead of hard-coded hex where practical.
 */
export const radii = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const type = {
  /** Display (hero) */
  display: { fontSize: 34, fontWeight: '700' as const, letterSpacing: -0.8 },
  headline: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.6 },
  /** Title large */
  title: { fontSize: 22, fontWeight: '600' as const, letterSpacing: -0.3 },
  titleMedium: { fontSize: 18, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const },
  bodyMedium: { fontSize: 15, fontWeight: '500' as const },
  label: { fontSize: 12, fontWeight: '500' as const, letterSpacing: 0.2 },
} as const;

export const glass = {
  /** Default backdrop blur strength for glass surfaces. */
  blur: 22,
  /** Border alpha used for hairline glass strokes. */
  borderAlpha: 0.18,
  /** Fill alpha for glass cards. */
  fillAlpha: 0.14,
} as const;

export const glow = {
  /** Used for neon glows and focus rings. */
  strong: 0.55,
  soft: 0.28,
} as const;

export const lightColors = {
  surface: '#F9F9F9',        // Soft Sandstone
  surfaceContainer: '#F0F0F0',
  onSurface: '#050608',
  onSurfaceMuted: '#505050',
  outline: '#D0D0D0',
  primary: '#1A3300',        // Deep Forest Onyx (High Contrast)
  onPrimary: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.15)',
  surfaceGlass: 'rgba(255,255,255,0.7)',
  surfaceGlassStrong: 'rgba(255,255,255,0.9)',
  dividerHairline: 'rgba(0,0,0,0.06)',
  neonPrimary: '#1A3300',    // Replaced Lime with Deep Green for readability
  neonSecondary: '#2D5900',
  neonGlow: 'rgba(26,51,0,0.15)',
  scrimStrong: 'rgba(0,0,0,0.5)',
};

export const darkColors = {
  surface: '#050608',        // Obsidian
  surfaceContainer: '#0F1012',
  onSurface: '#FFFFFF',
  onSurfaceMuted: '#A0A0A0',
  outline: '#1F2023',
  primary: '#CCFF00',        // Electric Lime
  onPrimary: '#050608',
  scrim: 'rgba(0,0,0,0.5)',
  surfaceGlass: 'rgba(5,6,8,0.6)',
  surfaceGlassStrong: 'rgba(5,6,8,0.8)',
  dividerHairline: 'rgba(255,255,255,0.08)',
  neonPrimary: '#CCFF00',
  neonSecondary: '#A3FF00',
  neonGlow: 'rgba(204,255,0,0.4)',
  scrimStrong: 'rgba(0,0,0,0.85)',
};
