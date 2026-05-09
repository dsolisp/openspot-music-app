import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Track } from '@/types/music';
import { MusicAPI } from '@/lib/music-api';
import { useLikedSongs } from '@/hooks/useLikedSongs';
import { useTranslation } from 'react-i18next';
import { useColorScheme } from '@/hooks/useColorScheme';
import { darkColors, lightColors, radii, space, type } from '@/src/ui/theme/tokens';
import { GlassCard, NeonButton } from '@/src/ui/components';

interface LikedSongsProps {
  onTrackSelect: (track: Track, trackList?: Track[], startIndex?: number) => void;
  isPlaying: boolean;
  currentTrack: Track | null;
}


export function LikedSongs({
  onTrackSelect,
  isPlaying,
  currentTrack,
}: LikedSongsProps) {
  const { likedSongs, isLoading, toggleLike, getLikedSongsAsTrack } = useLikedSongs();
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  const c = isDark ? darkColors : lightColors;
  const scrollY = useRef(new Animated.Value(0)).current;

  const likedTracks = getLikedSongsAsTrack();

  
  const headerHeight = scrollY.interpolate({
    inputRange: [0, 150],
    outputRange: [200, 0],
    extrapolate: 'clamp',
  });

  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 100, 150],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  const headerScale = scrollY.interpolate({
    inputRange: [0, 150],
    outputRange: [1, 0.8],
    extrapolate: 'clamp',
  });

  const renderTrackItem = ({ item, index }: { item: Track; index: number }) => {
    const isCurrentTrack = currentTrack?.id === item.id;

    return (
      <TouchableOpacity
        style={[
          styles.trackItem,
          isCurrentTrack && styles.currentTrackItem,
        ]}
        onPress={() => onTrackSelect(item, likedTracks, index)}
      >
        <Image
          source={{ uri: MusicAPI.getOptimalImage(item.images) }}
          style={styles.albumCover}
          contentFit="cover"
        />
        
        <View style={styles.trackInfo}>
          <Text
            style={[
              styles.trackTitle,
              isCurrentTrack && styles.currentTrackText,
              { color: isCurrentTrack ? c.neonPrimary : c.onSurface },
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text
            style={[
              styles.trackArtist,
              isCurrentTrack && styles.currentTrackText,
              { color: isCurrentTrack ? c.neonPrimary : c.onSurfaceMuted },
            ]}
            numberOfLines={1}
          >
            {item.artist}
          </Text>
          <Text style={[styles.trackDuration, { color: c.onSurfaceMuted }]}>
            {MusicAPI.formatDuration((item.duration ?? 0) / 1000)}
          </Text>
        </View>

        <View style={styles.trackActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => toggleLike(item)}
          >
            <Ionicons
              name="heart"
              size={20}
              color={c.neonSecondary}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => onTrackSelect(item, likedTracks, index)}
          >
            <Ionicons
              name={isCurrentTrack && isPlaying ? "pause" : "play"}
              size={20}
              color={isCurrentTrack ? c.neonPrimary : c.onSurfaceMuted}
            />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const renderHeader = () => (
    <Animated.View style={[
      styles.header,
      {
        height: headerHeight,
        opacity: headerOpacity,
        transform: [{ scale: headerScale }],
      }
    ]}>
      <GlassCard neon="secondary" padding={space.lg} style={styles.headerGradient}>
        <View style={styles.headerContent}>
          <View style={styles.headerIcon}>
            <Ionicons name="heart" size={74} color={c.neonSecondary} />
          </View>
          <Text style={[styles.headerTitle, { color: c.onSurface }]}>{t('components.liked_songs')}</Text>
          <Text style={[styles.headerSubtitle, { color: c.onSurfaceMuted }]}>
            {likedSongs.length} {likedSongs.length !== 1 ? t('components.songs') : t('components.song')}
          </Text>
        </View>
      </GlassCard>
    </Animated.View>
  );

  const renderPlayAllButton = () => {
    if (likedTracks.length === 0) return null;

    return (
      <View style={styles.playAllContainer}>
        <NeonButton title={t('components.play_all')} onPress={() => onTrackSelect(likedTracks[0], likedTracks, 0)} />
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="heart-outline" size={64} color="#888" />
      <Text style={styles.emptyTitle}>{t('components.no_liked_songs')}</Text>
      <Text style={styles.emptySubtitle}>
        {t('components.liked_songs_hint')}
      </Text>
      <Text style={styles.emptyHint}>
        {t('components.liked_songs_hint_2')}
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>{t('components.baking_favorites')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.FlatList
        data={likedTracks}
        renderItem={renderTrackItem}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={
          <>
            {renderHeader()}
            {renderPlayAllButton()}
          </>
        }
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContainer}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContainer: {
    flexGrow: 1,
    paddingBottom: 180, 
  },
  header: {
    height: 200,
    marginBottom: 20,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  headerGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContent: {
    alignItems: 'center',
  },
  headerIcon: {
    marginBottom: 16,
  },
  headerTitle: {
    ...type.headline,
    marginBottom: 8,
  },
  headerSubtitle: {
    ...type.body,
  },
  playAllContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  playAllButton: {
    /* replaced by NeonButton */
  },
  playAllText: {
    /* replaced by NeonButton */
  },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radii.md,
    marginVertical: 2,
    marginHorizontal: 4,
  },
  currentTrackItem: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  albumCover: {
    width: 50,
    height: 50,
    borderRadius: radii.sm,
    marginRight: space.md,
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  trackTitle: {
    ...type.bodyMedium,
    marginBottom: 2,
  },
  trackArtist: {
    ...type.label,
    marginBottom: 2,
  },
  trackDuration: {
    ...type.label,
  },
  currentTrackText: {
    /* color set at callsite */
  },
  trackActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  playingIndicator: {
    marginLeft: 8,
    padding: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyTitle: {
    ...type.title,
    marginTop: 24,
    marginBottom: 12,
  },
  emptySubtitle: {
    ...type.body,
    textAlign: 'center',
    marginBottom: 16,
  },
  emptyHint: {
    ...type.body,
    textAlign: 'center',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...type.body,
  },
}); 