import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList as FlatListType,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

import { Track } from '@/types/music';
import { MusicAPI } from '@/lib/music-api';
import { useLikedSongs } from '@/hooks/useLikedSongs';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useTranslation } from 'react-i18next';
import { darkColors, glass, lightColors, radii, space, type } from '@/src/ui/theme/tokens';

interface MusicQueueInterface {
  tracks: Track[];
  currentIndex: number;
  isShuffled: boolean;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  removeFromQueue: (index: number) => void;
  toggleShuffle: () => boolean;
  clearQueue: () => void;
}

interface QueueDisplayProps {
  isOpen: boolean;
  onClose: () => void;
  musicQueue: MusicQueueInterface;
  onTrackSelect: (track: Track, index: number) => void;
  currentTrack: Track | null;
}

export function QueueDisplay({
  isOpen,
  onClose,
  musicQueue,
  onTrackSelect,
  currentTrack,
}: QueueDisplayProps) {
  const { isLiked, toggleLike } = useLikedSongs();
  const { t } = useTranslation();
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const c = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);
  const flatListRef = useRef<FlatListType<Track>>(null);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  const theme = useMemo(
    () => ({
      base: isDark ? '#05060A' : '#f5efe6',
      glass: c.surfaceGlass,
      glassBorder: `rgba(255,255,255,${glass.borderAlpha})`,
      textPrimary: c.onSurface,
      textSecondary: c.onSurfaceMuted,
      accent: c.neonPrimary,
      track: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(45,34,25,0.10)',
      icon: c.onSurface,
      disabled: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(45,34,25,0.32)',
    }),
    [isDark, c]
  );

  useEffect(() => {
    if (isOpen && musicQueue.tracks.length > 0) {
      const scrollIndex = Math.max(0, musicQueue.currentIndex - 3);
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: scrollIndex,
          animated: true,
          viewPosition: 0,
        });
      }, 100);
    }
  }, [isOpen, musicQueue.currentIndex, musicQueue.tracks.length]);

  const renderTrackItem = useCallback(
    ({ item, index }: { item: Track; index: number }) => {
      const isCurrentTrack = musicQueue.currentIndex === index;
      const isTrackLiked = isLiked(item.id);

      return (
        <TouchableOpacity
          style={[
            styles.trackItem,
            isLandscape && styles.trackItemLandscape,
            isCurrentTrack && [styles.currentTrackItem, { backgroundColor: theme.glass }],
          ]}
          onPress={() => onTrackSelect(item, index)}
        >
          <View style={styles.trackNumber}>
            <Text
              style={[
                styles.trackNumberText,
                { color: theme.textSecondary },
                isCurrentTrack && { color: theme.accent },
              ]}
            >
              {index + 1}
            </Text>
          </View>

          <Image
            source={{ uri: MusicAPI.getOptimalImage(item.images) }}
            style={styles.albumCover}
            contentFit="cover"
          />

          <View style={styles.trackInfo}>
            <Text
              style={[
                styles.trackTitle,
                { color: theme.textPrimary },
                isCurrentTrack && { color: theme.accent },
              ]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text
              style={[
                styles.trackArtist,
                { color: theme.textSecondary },
                isCurrentTrack && { color: theme.accent },
              ]}
              numberOfLines={1}
            >
              {item.artist}
            </Text>
            <Text style={[styles.trackDuration, { color: theme.textSecondary }]}>
              {MusicAPI.formatDuration((item.duration ?? 0) / 1000)} {/* ✅ fallback */}
            </Text>
          </View>

          <View style={styles.trackActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => musicQueue.moveQueueItem(index, Math.max(0, index - 1))}
              disabled={index === 0}
            >
              <Ionicons
                name="arrow-up"
                size={18}
                color={index === 0 ? theme.disabled : theme.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() =>
                musicQueue.moveQueueItem(index, Math.min(musicQueue.tracks.length - 1, index + 1))
              }
              disabled={index === musicQueue.tracks.length - 1}
            >
              <Ionicons
                name="arrow-down"
                size={18}
                color={index === musicQueue.tracks.length - 1 ? theme.disabled : theme.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => toggleLike(item)}>
              <Ionicons
                name={isTrackLiked ? 'heart' : 'heart-outline'}
                size={20}
                color={isTrackLiked ? theme.accent : theme.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => musicQueue.removeFromQueue(index)}>
              <Ionicons name="close-circle-outline" size={20} color={theme.textSecondary} />
            </TouchableOpacity>

            {isCurrentTrack && (
              <View style={styles.playingIndicator}>
                <Ionicons name="volume-high" size={16} color={theme.accent} />
              </View>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [theme, musicQueue, isLiked, toggleLike, onTrackSelect, isLandscape]
  );

  const renderHeader = () => (
    <View style={[styles.header, isLandscape && styles.headerLandscape]}>
      <LinearGradient
        colors={
          isDark
            ? ['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.95)']
            : ['rgba(245,239,230,0.8)', 'rgba(245,239,230,0.95)']
        }
        style={[styles.headerGradient, isLandscape && styles.headerGradientLandscape]}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity style={[styles.closeButton, { backgroundColor: theme.glass }]} onPress={onClose}>
            <Ionicons name="chevron-down" size={24} color={theme.icon} />
          </TouchableOpacity>

          <Text style={[styles.headerTitle, isLandscape && styles.headerTitleLandscape, { color: theme.textPrimary }]}>{t('components.queue')}</Text>
          <Text style={[styles.headerSubtitle, isLandscape && styles.headerSubtitleLandscape, { color: theme.textSecondary }]}>
            {musicQueue.tracks.length} {musicQueue.tracks.length !== 1 ? t('components.songs') : t('components.song')}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );

  const renderQueueControls = () => (
    <View style={[styles.queueControls, isLandscape && styles.queueControlsLandscape, { borderBottomColor: theme.glassBorder }]}>
      <TouchableOpacity
        style={[
          styles.controlButton,
          { backgroundColor: theme.glass },
          musicQueue.isShuffled && [styles.activeControlButton, { backgroundColor: theme.accent }],
        ]}
        onPress={musicQueue.toggleShuffle}
      >
        <Ionicons name="shuffle" size={20} color={musicQueue.isShuffled ? '#fff' : theme.textSecondary} />
        <Text
          style={[
            styles.controlButtonText,
            { color: theme.textSecondary },
            musicQueue.isShuffled && styles.activeControlButtonText,
          ]}
        >
          {t('components.shuffle')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.controlButton, { backgroundColor: theme.glass }]} onPress={musicQueue.clearQueue}>
        <Ionicons name="trash-outline" size={20} color={theme.textSecondary} />
        <Text style={[styles.controlButtonText, { color: theme.textSecondary }]}>{t('components.clear')}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="list-outline" size={64} color={theme.textSecondary} />
      <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>{t('components.queue_empty')}</Text>
      <Text style={[styles.emptySubtitle, { color: theme.textSecondary }]}>{t('components.queue_empty_hint')}</Text>
    </View>
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => {
      const itemHeight = isLandscape ? 54 : 70;
      return {
        length: itemHeight,
        offset: itemHeight * index,
        index,
      };
    },
    [isLandscape]
  );

  return (
    <Modal visible={isOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.base }]}>
        <BlurView intensity={isDark ? 10 : 0} tint={isDark ? 'dark' : 'light'} style={styles.blurContainer}>
          {renderHeader()}
          {renderQueueControls()}

          {musicQueue.tracks.length === 0 ? (
            renderEmptyState()
          ) : (
            <FlatList
              ref={flatListRef}
              data={musicQueue.tracks}
              renderItem={renderTrackItem}
              keyExtractor={(item, index) => `${item.id}-${index}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.listContainer, isLandscape && styles.listContainerLandscape]}
              getItemLayout={getItemLayout}
              removeClippedSubviews={true}
              maxToRenderPerBatch={10}
              windowSize={5}
            />
          )}
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  blurContainer: { flex: 1 },
  header: { paddingTop: space.lg, paddingBottom: space.sm },
  headerLandscape: { paddingTop: space.sm, paddingBottom: space.xs },
  headerGradient: { paddingVertical: space.lg },
  headerGradientLandscape: { paddingVertical: space.md },
  headerContent: { alignItems: 'center' },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: space.md,
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { ...type.title, marginBottom: space.xs },
  headerTitleLandscape: { ...type.titleMedium, marginBottom: 4 },
  headerSubtitle: { ...type.body },
  headerSubtitleLandscape: { ...type.label },
  queueControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
  },
  queueControlsLandscape: {
    paddingVertical: space.sm,
  },
  controlButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.pill },
  activeControlButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: radii.pill },
  controlButtonText: { ...type.label, marginLeft: 6 },
  activeControlButtonText: { ...type.label, marginLeft: 6 },
  listContainer: { paddingVertical: space.sm },
  listContainerLandscape: { paddingVertical: space.xs },
  trackItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radii.md,
    marginVertical: 2,
    marginHorizontal: 4,
  },
  trackItemLandscape: {
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
  },
  currentTrackItem: {},
  trackNumber: { width: 24, alignItems: 'center', marginRight: space.md },
  trackNumberText: { ...type.label },
  albumCover: { width: 40, height: 40, borderRadius: radii.sm, marginRight: space.md },
  trackInfo: { flex: 1, justifyContent: 'center' },
  trackTitle: { ...type.bodyMedium, marginBottom: 2 },
  trackArtist: { ...type.label, marginBottom: 2 },
  trackDuration: { ...type.label },
  trackActions: { flexDirection: 'row', alignItems: 'center' },
  actionButton: { padding: 8, marginLeft: 4 },
  playingIndicator: { marginLeft: 8, padding: 4 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { ...type.title, marginTop: space.md, marginBottom: space.xs },
  emptySubtitle: { ...type.body, textAlign: 'center' },
});