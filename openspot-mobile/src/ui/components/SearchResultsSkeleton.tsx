import { View, StyleSheet } from 'react-native';
import { radii, space } from '@/src/ui/theme/tokens';

/** Placeholder rows while search loads (track list layout). */
export function SearchResultsSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar">
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.row}>
          <View style={styles.art} />
          <View style={styles.textCol}>
            <View style={styles.lineL} />
            <View style={styles.lineS} />
          </View>
        </View>
      ))}
    </View>
  );
}

const pulse = '#ffffff18';

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: space.md,
    paddingTop: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.md,
  },
  art: {
    width: 56,
    height: 56,
    borderRadius: radii.sm,
    backgroundColor: pulse,
  },
  textCol: {
    flex: 1,
    marginLeft: space.md,
    gap: 8,
  },
  lineL: {
    height: 14,
    borderRadius: 4,
    backgroundColor: pulse,
    width: '72%',
  },
  lineS: {
    height: 12,
    borderRadius: 4,
    backgroundColor: pulse,
    width: '44%',
  },
});
