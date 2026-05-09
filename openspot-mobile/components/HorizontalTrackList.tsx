import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Track } from '@/types/music';
import { MusicAPI } from '@/lib/music-api';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useTranslation } from 'react-i18next';
import { darkColors, lightColors, radii, space, type } from '@/src/ui/theme/tokens';


interface HorizontalTrackListProps {
  title: string;
  tracks: Track[];
  onTrackSelect: (track: Track, trackList?: Track[], startIndex?: number) => void;
  onAddToQueue?: (track: Track) => void;
  isPlaying: boolean;
  currentTrack: Track | null;
}

export function HorizontalTrackList({ title, tracks, onTrackSelect, onAddToQueue, isPlaying, currentTrack }: HorizontalTrackListProps) {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const c = isDark ? darkColors : lightColors;
  const accent = c.neonPrimary;
  const { t } = useTranslation();
  const renderTrackItem = ({ item, index }: { item: Track; index: number }) => {
    const isCurrentTrack = currentTrack?.id === item.id;
    return (
      <View style={styles.cardWrapper}>
        <TouchableOpacity
          style={[
            styles.card,
            { backgroundColor: isDark ? '#181818' : '#fffaf2', borderColor: isDark ? '#232323' : '#e4d5c5' },
            isCurrentTrack && [styles.currentTrackCard, { borderColor: accent }],
          ]}
          onPress={() => onTrackSelect(item, tracks, index)}
          activeOpacity={0.85}
        >
          <View style={styles.albumArtWrapper}>
            <Image
              source={{ uri: MusicAPI.getOptimalImage(item.images) }}
              style={styles.albumArt}
              contentFit="cover"
            />
            <TouchableOpacity
              style={[styles.playButton, { backgroundColor: accent }]}
              onPress={() => onTrackSelect(item, tracks, index)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={isCurrentTrack && isPlaying ? 'pause' : 'play'}
                size={28}
                color="#fff"
              />
            </TouchableOpacity>
          </View>
          <View style={styles.cardTextContainer}>
            <Text
              style={[
                styles.trackTitle,
                { color: isDark ? '#fff' : '#2d2219' },
                isCurrentTrack && [styles.currentTrackText, { color: accent }],
              ]}
              numberOfLines={1}
            >
              {MusicAPI.sanitizeTitle(item.title, item.artist)}
            </Text>
            <Text style={[styles.trackArtist, { color: isDark ? '#a9a9a9' : '#7a6251' }]} numberOfLines={1}>
              {MusicAPI.sanitizeArtist(item.artist)}
            </Text>
            {onAddToQueue && (
              <TouchableOpacity
                style={[styles.queueButton, { borderColor: isDark ? '#2d2d2d' : '#d8c8b8' }]}
                onPress={() => onAddToQueue(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={14} color={isDark ? '#fff' : '#2d2219'} />
                <Text style={[styles.queueButtonText, { color: isDark ? '#fff' : '#2d2219' }]}>{t('components.queue')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.sectionContainer}>
      <Text style={[styles.sectionTitle, { color: c.onSurface }]}>{title}</Text>
      <FlatList
        data={tracks}
        renderItem={renderTrackItem}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalList}
      />
    </View>
  );
}

const CARD_WIDTH = 128;
const CARD_HEIGHT = 172;
const ALBUM_SIZE = 110;

const styles = StyleSheet.create({
  sectionContainer: {
    marginBottom: space.xs,
  },
  sectionTitle: {
    ...type.titleMedium,
    marginLeft: space.md,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  horizontalList: {
    paddingLeft: space.sm,
    paddingBottom: space.sm,
  },
  cardWrapper: {
    marginRight: space.md,
  },
  card: {
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 6,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  currentTrackCard: {
    borderWidth: 2,
  },
  albumArtWrapper: {
    width: ALBUM_SIZE,
    height: ALBUM_SIZE,
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumArt: {
    width: ALBUM_SIZE,
    height: ALBUM_SIZE,
    borderRadius: 16,
  },
  playButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  cardTextContainer: {
    alignItems: 'flex-start',
    width: '100%',
    paddingHorizontal: 10,
    marginTop: 2,
    paddingBottom: 10,
    minHeight: 48,
    justifyContent: 'flex-start',
  },
  trackTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  trackArtist: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
    letterSpacing: 0.3,
  },
  currentTrackText: {
    /* color set at callsite */
  },
  queueButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  queueButtonText: {
    ...type.label,
  },
}); 