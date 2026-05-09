import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Animated,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import TrackPlayer, { Capability, Event, State, useProgress } from 'react-native-track-player';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';

import { Track } from '../types/music';
import { MusicAPI } from '../lib/music-api';
import { getDownloadByTrackId } from '@/src/storage/downloadsRepo';
import { FullScreenPlayer } from './FullScreenPlayer';
import { useLikedSongs } from '../hooks/useLikedSongs';
import { useColorScheme } from '../hooks/useColorScheme';
import { useTranslation } from 'react-i18next';
import { darkColors, glass, glow, lightColors, radii, space, type } from '@/src/ui/theme/tokens';
import { BlurView } from 'expo-blur';
import { ArtworkTile } from '@/src/ui/components';
import { Logger } from '@/src/utils/logger';

interface PlayerProps {
  track: Track | null;
  isPlaying: boolean;
  onPlayingChange: (playing: boolean) => void;
  musicQueue: any;
  onQueueToggle: () => void;
  pendingAutoPlayRef?: React.MutableRefObject<boolean>;
  showToast?: (message: string, type: 'success' | 'error') => void;
}

const ProgressBarFill = React.memo(({ duration, position, color }: { duration: number, position: number, color: string }) => {
  const width = duration > 0 ? `${(position / duration) * 100}%` : '0%';
  return (
    <View
      style={[
        styles.whiteProgressBarFill,
        {
          backgroundColor: color,
          width,
        },
      ]}
    />
  );
});

export function Player({
  track,
  isPlaying,
  onPlayingChange,
  musicQueue,
  onQueueToggle,
  pendingAutoPlayRef: externalPendingAutoPlayRef,
  showToast,
}: PlayerProps) {
  const { width: windowWidth } = useWindowDimensions();
  const playerReadyRef = useRef(false);
  const [playerReady, setPlayerReady] = useState(false);
  const internalPendingAutoPlayRef = useRef(false);
  const pendingAutoPlayRef = externalPendingAutoPlayRef || internalPendingAutoPlayRef;
  const lastQueueSignatureRef = useRef<string | null>(null);
  const lastTrackIdRef = useRef<string | number | null>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const c = useMemo(() => (isDark ? darkColors : lightColors), [isDark]);
  const theme = useMemo(
    () => ({
      card: isDark ? '#181a1f' : '#fffaf2',
      cardSubtle: isDark ? '#222733' : '#efe4d6',
      textPrimary: isDark ? '#ffffff' : '#2d2219',
      textSecondary: isDark ? '#b9c0d6' : '#7a6251',
      icon: isDark ? '#ffffff' : '#2d2219',
      accent: c.neonPrimary,
      progressBg: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(45,34,25,0.18)',
      progressFill: isDark ? '#ffffff' : '#2d2219',
      border: isDark ? '#2a2f3a' : '#e4d5c5',
    }),
    [isDark, c.neonPrimary]
  );
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false);
  const [isSeeking] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'success' | 'error'>('idle');
  const [downloadError, setDownloadError] = useState<string>('');
  const [shareMode, setShareMode] = useState(false);

  const { isLiked, toggleLike } = useLikedSongs();
  const { t } = useTranslation();
  const rotationValue = useRef(new Animated.Value(0)).current;
  const rotationAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const isMountedRef = useRef(true);
  const downloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentTrackIdRef = useRef<string | number | null>(null);
  const queueBuildAbortRef = useRef<AbortController | null>(null);
  const queueBuildGenRef = useRef(0);
  const queueBuildDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const isInternalChangeRef = useRef(false);
  /** Only keep current + this many upcoming tracks resolved in TrackPlayer (JIT; reduces URL expiry). */
  const PREFETCH_AHEAD = 1;
  const { position: tpPosition, duration: tpDuration } = useProgress(250);

  
  useEffect(() => {
    const setupPlayer = async () => {
      try {
        if (!playerReadyRef.current) {
          try {
            await TrackPlayer.setupPlayer();
          } catch (setupError: any) {
            if (!setupError?.message?.includes('already been initialized')) {
              throw setupError;
            }
          }
          
          await TrackPlayer.updateOptions({
            capabilities: [
              Capability.Play,
              Capability.Pause,
              Capability.SkipToNext,
              Capability.SkipToPrevious,
              Capability.SeekTo,
              Capability.Stop,
            ],
            compactCapabilities: [Capability.Play, Capability.Pause, Capability.SkipToNext],
          });
          playerReadyRef.current = true;
          if (isMountedRef.current) {
            setPlayerReady(true);
          }
        }
      } catch (error) {
        console.error('Failed to setup TrackPlayer:', error);
      }
    };

    setupPlayer();

    return () => {
      isMountedRef.current = false;
      currentTrackIdRef.current = null;
      if (downloadTimeoutRef.current) clearTimeout(downloadTimeoutRef.current);
      if (downloadAbortRef.current) downloadAbortRef.current.abort();
      if (queueBuildAbortRef.current) queueBuildAbortRef.current.abort();
      if (queueBuildDebounceRef.current) clearTimeout(queueBuildDebounceRef.current);
      stopRotation();
    };
  }, [stopRotation]);

  useEffect(() => {
    if (playerReady) {
      TrackPlayer.setVolume(isMuted ? 0 : volume).catch(() => {});
    }
  }, [volume, isMuted, playerReady]);

  
  useEffect(() => {
    if (!isSeeking) {
      setPosition(tpPosition * 1000);
    }
    setDuration(tpDuration * 1000);
  }, [tpPosition, tpDuration, isSeeking]);

  
  useEffect(() => {
    if (!playerReady) return;
    isInternalChangeRef.current = true;
    if (isPlaying) {
      pendingAutoPlayRef.current = true;
      TrackPlayer.play().catch(() => {});
    } else {
      TrackPlayer.pause().catch(() => {});
    }
    const timer = setTimeout(() => { isInternalChangeRef.current = false; }, 800);
    return () => clearTimeout(timer);
  }, [isPlaying, playerReady, pendingAutoPlayRef]);

  
  const startRotation = useCallback(() => {
    if (rotationAnimationRef.current) {
      rotationAnimationRef.current.stop();
    }
    rotationAnimationRef.current = Animated.loop(
      Animated.timing(rotationValue, {
        toValue: 1,
        duration: 10000,
        useNativeDriver: true,
      }),
      { iterations: -1 }
    );
    rotationAnimationRef.current.start();
  }, [rotationValue]);

  const stopRotation = useCallback(() => {
    if (rotationAnimationRef.current) {
      rotationAnimationRef.current.stop();
      rotationAnimationRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPlaying) {
      startRotation();
    } else {
      stopRotation();
    }
    return () => stopRotation();
  }, [isPlaying, startRotation]);

  
  const resolveTrackUrl = useCallback(async (t: Track): Promise<string> => {
    try {
      const row = await getDownloadByTrackId(t.id);
      if (row?.file_uri) {
        const info = await FileSystem.getInfoAsync(row.file_uri);
        if (info.exists) return row.file_uri;
      }
    } catch {}
    return MusicAPI.getStreamUrl(t.id.toString(), t);
  }, []);

  
  const musicQueueRef = useRef(musicQueue);
  useEffect(() => {
    musicQueueRef.current = musicQueue;
  }, [musicQueue]);

  const topUpTrackPlayerPrefetch = useCallback(async () => {
    try {
      if (!playerReadyRef.current) return;
      const mq = musicQueueRef.current;
      if (!mq?.tracks?.length || mq.currentIndex < 0) return;
      const idx = mq.currentIndex as number;
      const tracks = mq.tracks as Track[];
      const tpQueue = await TrackPlayer.getQueue();
      const ids = new Set(tpQueue.map((x) => (x?.id != null ? String(x.id) : '')).filter(Boolean));
      for (let k = 1; k <= PREFETCH_AHEAD; k++) {
        const j = idx + k;
        if (j >= tracks.length) break;
        const t = tracks[j];
        const idStr = t.id.toString();
        if (ids.has(idStr)) continue;
        try {
          const url = await resolveTrackUrl(t);
          await TrackPlayer.add({
            id: idStr,
            url,
            title: t.title,
            artist: t.artist,
            artwork: MusicAPI.getOptimalImage(t.images),
            duration: t.duration ? Math.floor(t.duration / 1000) : undefined,
          });
          ids.add(idStr);
        } catch {
          /* noop */
        }
      }
    } catch (e) {
      console.warn('[Player] topUp prefetch failed', e);
    }
  }, [resolveTrackUrl]);

  const handleNext = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const queue = musicQueueRef.current;
    const nextTrack = queue.playNext();
    if (nextTrack) {
      isInternalChangeRef.current = true;
      onPlayingChange(true);
      setTimeout(() => { isInternalChangeRef.current = false; }, 500);
    } else {
      onPlayingChange(false);
    }
  }, [onPlayingChange]);

  const handlePrevious = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const queue = musicQueueRef.current;
    const prevTrack = queue.playPrevious();
    if (prevTrack) {
      
      isInternalChangeRef.current = true;
      pendingAutoPlayRef.current = true;
      onPlayingChange(true);
      setTimeout(() => { isInternalChangeRef.current = false; }, 500);
    }
  }, [pendingAutoPlayRef, onPlayingChange]);

  
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
      pendingAutoPlayRef.current = true;
      handleNext();
    });
    return () => sub.remove();
  }, [handleNext, pendingAutoPlayRef]);

  
  useEffect(() => {
    let bufferingTimeout: ReturnType<typeof setTimeout> | null = null;
    const sub = TrackPlayer.addEventListener(Event.PlaybackState, (event) => {
      if (isInternalChangeRef.current) return;

      if (event.state === State.Playing) {
        if (!isPlaying) onPlayingChange(true);
        if (bufferingTimeout) {
          clearTimeout(bufferingTimeout);
          bufferingTimeout = null;
        }
      } else if (event.state === State.Paused) {
        if (isPlaying) onPlayingChange(false);
        if (bufferingTimeout) {
          clearTimeout(bufferingTimeout);
          bufferingTimeout = null;
        }
      } else if (event.state === State.Buffering || event.state === State.Loading) {
        if (!bufferingTimeout) {
          bufferingTimeout = setTimeout(() => {
            console.warn('[Player] Watchdog: Stuck in buffering. Forcing next...');
            handleNext();
            if (showToast) showToast(t('player.stream_timeout'), 'error');
            bufferingTimeout = null;
          }, 10000);
        }
      }
    });
    return () => {
      sub.remove();
      if (bufferingTimeout) clearTimeout(bufferingTimeout);
    };
  }, [isPlaying, onPlayingChange, handleNext, showToast, t]);
  
  useEffect(() => {
    const sub = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event) => {
      if (isInternalChangeRef.current) return;
      const activeTrack = event.track;
      if (activeTrack?.id && musicQueueRef.current?.tracks?.length) {
        const queueIndex = musicQueueRef.current.tracks.findIndex(
          (t: Track) => t.id.toString() === activeTrack.id
        );
        if (queueIndex >= 0 && musicQueueRef.current.setCurrentIndex) {
          musicQueueRef.current.setCurrentIndex(queueIndex);
        }
      }
      void topUpTrackPlayerPrefetch();
    });
    return () => sub.remove();
  }, [topUpTrackPlayerPrefetch]);

  
  const syncTrackPlayerQueue = useCallback(async () => {
    if (!playerReady) return;
    if (!musicQueue?.tracks?.length || musicQueue.currentIndex < 0) return;
    if (!track) return;

    if (queueBuildDebounceRef.current) {
      clearTimeout(queueBuildDebounceRef.current);
    }
    if (queueBuildAbortRef.current) {
      queueBuildAbortRef.current.abort();
      queueBuildAbortRef.current = null;
    }

    queueBuildGenRef.current = -(Math.abs(queueBuildGenRef.current) + 1);
    const myGen = Math.abs(queueBuildGenRef.current);

    queueBuildDebounceRef.current = setTimeout(async () => {
      queueBuildDebounceRef.current = null;
      if (Math.abs(queueBuildGenRef.current) !== myGen) return;

      const queueTracks = musicQueue.tracks as Track[];
      const startIndex = musicQueue.currentIndex as number;
      const orderHash = queueTracks.map(t => t.id).join(',');
      const currentTrack = queueTracks[startIndex];
      const signature = `${currentTrack?.id}|${queueTracks.length}|${startIndex}|${orderHash}`;
      const isSameSignature = lastQueueSignatureRef.current === signature;

      const currentTrackId = String(currentTrack?.id);
      if (lastTrackIdRef.current !== currentTrackId) {
        lastTrackIdRef.current = currentTrackId;
        lastQueueSignatureRef.current = null;
      }

      if (isSameSignature) {
        if (pendingAutoPlayRef.current || isPlaying) {
          pendingAutoPlayRef.current = false;
          await TrackPlayer.play();
        } else {
          await TrackPlayer.pause();
        }
        return;
      }

      lastQueueSignatureRef.current = signature;
      currentTrackIdRef.current = currentTrack?.id;

      const current = queueTracks[startIndex];
      if (!current) return;

      const shouldPlayNow = pendingAutoPlayRef.current || isPlaying;
      pendingAutoPlayRef.current = false;

      
      isInternalChangeRef.current = true;
      const suppressTimer = setTimeout(() => { isInternalChangeRef.current = false; }, 1500);

      const activeTrack = await TrackPlayer.getActiveTrack();
      const isSameTrack = activeTrack?.id === current.id.toString();

      try {
        if (isSameTrack) {
          
          const tpQueue = await TrackPlayer.getQueue();
          const currentIndexInTp = tpQueue.findIndex(item => item.id === current.id.toString());
          if (currentIndexInTp !== -1) {
            for (let i = tpQueue.length - 1; i >= 0; i--) {
              if (i !== currentIndexInTp) {
                try {
                  await TrackPlayer.remove(i);
                } catch {}
              }
            }
          }
        } else {
          let currentUrl: string;
          try {
            currentUrl = await resolveTrackUrl(current);
          } catch (streamError) {
            console.error('[Player] Failed to resolve stream URL:', streamError);
            await TrackPlayer.pause();
            onPlayingChange(false);
            if (showToast) {
              showToast(t('player.stream_error_message'), 'error');
            } else {
              Alert.alert(
                t('player.stream_error_title'),
                t('player.stream_error_message')
              );
            }
            return;
          }

          // ABORT CHECK: If the user changed the track while we were waiting for the URL to resolve
          if (Math.abs(queueBuildGenRef.current) !== myGen) {
            console.log('[Player] Track changed while resolving URL. Aborting stale playback.');
            return;
          }

          const currentItem = {
            id: current.id.toString(),
            url: currentUrl,
            title: current.title,
            artist: current.artist,
            artwork: MusicAPI.getOptimalImage(current.images),
            duration: current.duration ? Math.floor(current.duration / 1000) : undefined,
          };
          await TrackPlayer.reset();
          await TrackPlayer.add([currentItem]);
          Logger.log(`TrackPlayer added: ${current.title} (${current.id})`, 'info', 'Player');
          if (shouldPlayNow) await TrackPlayer.play();
          else await TrackPlayer.pause();
        }
      } finally {
        clearTimeout(suppressTimer);
        
        setTimeout(() => { isInternalChangeRef.current = false; }, 800);
      }

      if (queueBuildAbortRef.current) {
        queueBuildAbortRef.current.abort();
      }
      queueBuildAbortRef.current = new AbortController();

      void (async () => {
        const signal = queueBuildAbortRef.current?.signal;
        if (!signal) return;
        try {
          for (let k = 1; k <= PREFETCH_AHEAD && !signal.aborted; k++) {
            const i = startIndex + k;
            if (i >= queueTracks.length) break;
            const t = queueTracks[i];
            try {
              const url = await resolveTrackUrl(t);
              await TrackPlayer.add([
                {
                  id: t.id.toString(),
                  url,
                  title: t.title,
                  artist: t.artist,
                  artwork: MusicAPI.getOptimalImage(t.images),
                  duration: t.duration ? Math.floor(t.duration / 1000) : undefined,
                },
              ]);
            } catch {}
          }
        } catch (error) {
          console.error('[Player] Queue build error (gen:', myGen, '):', error);
        } finally {
          if (Math.abs(queueBuildGenRef.current) === myGen) {
            queueBuildGenRef.current = myGen;
          }
          if (queueBuildAbortRef.current?.signal === signal) {
            queueBuildAbortRef.current = null;
          }
        }
      })();
    }, 50);
  }, [playerReady, musicQueue?.tracks, musicQueue?.currentIndex, track, isPlaying, onPlayingChange, pendingAutoPlayRef, t, resolveTrackUrl, showToast]);

  
  useEffect(() => {
    if (!playerReady) return;
    void syncTrackPlayerQueue();
  }, [playerReady, syncTrackPlayerQueue]);

  
  const handlePlayPause = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      
      isInternalChangeRef.current = true;
      
      if (isPlaying) {
        await TrackPlayer.pause();
        onPlayingChange(false);
      } else {
        pendingAutoPlayRef.current = true;
        await TrackPlayer.play();
        onPlayingChange(true);
      }
      
      
      setTimeout(() => {
        isInternalChangeRef.current = false;
      }, 500);
    } catch (error) {
      console.error('Error in handlePlayPause:', error);
      isInternalChangeRef.current = false;
    }
  }, [isPlaying, onPlayingChange, pendingAutoPlayRef]);

  const handleSeek = async (value: number) => {
    try {
      setPosition(value);
      await TrackPlayer.seekTo(value / 1000);
    } catch (error) {
      console.error('Error seeking:', error);
    }
  };

  const handleVolumeChange = async (value: number) => {
    setVolume(value);
    await TrackPlayer.setVolume(isMuted ? 0 : value).catch(() => {});
  };
  const handleMute = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    await TrackPlayer.setVolume(newMutedState ? 0 : volume).catch(() => {});
  };
  const handleShuffle = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { isShuffled, toggleShuffle, setQueueTracks } = useQueueStore.getState();
    
    if (isShuffled) {
      // Toggle off
      toggleShuffle();
    } else if (track) {
      // SMART SHUFFLE: Generate a context-aware queue
      if (showToast) showToast(t('player.generating_smart_mix'), 'success');
      try {
        const smartTracks = await MusicAPI.getSmartScopeQueue(track);
        if (smartTracks.length > 0) {
          // Put current track first, then the smart ones
          setQueueTracks([track, ...smartTracks.filter(t => t.id !== track.id)], 0);
          // Toggle the shuffled state for UI
          useQueueStore.setState({ isShuffled: true });
        }
      } catch (error) {
        console.error('Smart Shuffle failed:', error);
        toggleShuffle(); // Fallback to basic shuffle
      }
    }
  };

  
  const handleShare = async () => {
    if (!track) return;
    if (downloadStatus === 'downloading') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isPlaying) {
      TrackPlayer.pause().catch(() => {});
      onPlayingChange(false);
    }

    if (isMountedRef.current) {
      setShareMode(true);
      setDownloadProgress(0);
      setDownloadStatus('idle');
      setDownloadError('');
      setIsDownloadModalOpen(true);
    }

    if (downloadAbortRef.current) {
      downloadAbortRef.current.abort();
    }
    downloadAbortRef.current = new AbortController();

    try {
      const signal = downloadAbortRef.current.signal;
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        if (isMountedRef.current) {
          setDownloadError('Sharing is not available on this device');
          setDownloadStatus('error');
        }
        return;
      }

      if (isMountedRef.current) setDownloadStatus('downloading');
      const audioUrl = await MusicAPI.getDownloadUrl(track.id.toString(), track);

      const sanitizeFileName = (name: string): string => {
        if (!name) return 'unknown';
        const sanitized = name.replace(/[<>:"/\\|?*]/g, '').trim();
        return sanitized.length > 0 ? sanitized.substring(0, 50) : 'unknown';
      };
      const safeTitle = sanitizeFileName(track.title);
      const safeArtist = sanitizeFileName(track.artist);
      const safeFileName = `${safeTitle}_${safeArtist}_${Date.now()}.mp3`;
      const fileUri = FileSystem.documentDirectory + safeFileName;

      const fileInfo = await FileSystem.getInfoAsync(fileUri);
      if (fileInfo.exists) {
        if (isMountedRef.current) {
          setDownloadError('File already exists. Please try again for a unique filename.');
          setDownloadStatus('error');
        }
        return;
      }

      const downloadResumable = FileSystem.createDownloadResumable(
        audioUrl,
        fileUri,
        {},
        (downloadProgress) => {
          if (isMountedRef.current && !signal.aborted) {
            const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
            setDownloadProgress(Math.round(progress * 100));
          }
        }
      );

      const downloadResult = await downloadResumable.downloadAsync();
      if (signal.aborted) return;

      if (downloadResult) {
        await Sharing.shareAsync(downloadResult.uri, {
          mimeType: 'audio/mpeg',
          dialogTitle: `Share ${track.title} by ${track.artist}`,
          UTI: 'public.audio',
        });

        if (isMountedRef.current) {
          setDownloadStatus('success');
          if (downloadTimeoutRef.current) clearTimeout(downloadTimeoutRef.current);
          downloadTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setIsDownloadModalOpen(false);
              downloadTimeoutRef.current = null;
            }
          }, 3000);
        }
      }
    } catch (error) {
      console.error('Download failed:', error);
      if (isMountedRef.current) {
        setDownloadError('Download failed. Please check your internet connection and try again.');
        setDownloadStatus('error');
      }
    }
  };

  const handleCloseDownloadModal = () => {
    if (downloadAbortRef.current) {
      downloadAbortRef.current.abort();
    }
    if (downloadTimeoutRef.current) {
      clearTimeout(downloadTimeoutRef.current);
      downloadTimeoutRef.current = null;
    }
    if (isMountedRef.current) {
      setIsDownloadModalOpen(false);
      setShareMode(false);
    }
  };

  if (!track) return null;

  
  return (
    <>
      <View style={styles.cardroot}>
        <BlurView
          tint={isDark ? 'dark' : 'light'}
          intensity={85} // Even stronger for premium feel
          style={[
            styles.cardContainer,
            {
              backgroundColor: c.surfaceGlassStrong,
              borderColor: c.outline,
              borderWidth: 1.5,
              borderRadius: radii.lg,
              overflow: 'hidden', // Master clip here
            },
          ]}
        >
          <View style={styles.cardMainRow}>
            <TouchableOpacity
              style={styles.cardTouchable}
              activeOpacity={0.85}
              onPress={() => setIsFullScreenOpen(true)}
            >
              <ArtworkTile uri={MusicAPI.getOptimalImage(track.images)} size={52} style={styles.cardAlbumArt} />
              <View style={styles.cardInfoArea}>
                <Text style={[styles.cardTitle, { color: c.onSurface }]} numberOfLines={1}>
                  {MusicAPI.sanitizeTitle(track.title, track.artist)}
                </Text>
                <Text style={[styles.cardArtist, { color: c.onSurfaceMuted }]} numberOfLines={1}>
                  {MusicAPI.sanitizeArtist(track.artist)}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={styles.cardActionsRow}>
              <TouchableOpacity style={styles.cardIconButton} onPress={() => toggleLike(track)} activeOpacity={0.7}>
                <Ionicons
                  name={isLiked(track.id) ? 'heart' : 'heart-outline'}
                  size={24}
                  color={isLiked(track.id) ? c.neonSecondary : c.onSurface}
                />
              </TouchableOpacity>
              <TouchableOpacity style={styles.cardIconButton} onPress={onQueueToggle} activeOpacity={0.7}>
                <Ionicons name="list" size={24} color={c.onSurface} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.cardIconButton} onPress={handlePlayPause} activeOpacity={0.7}>
                <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color={c.onSurface} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.whiteProgressBarBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(45,34,25,0.14)' }]}>
            <ProgressBarFill duration={duration} position={position} color={c.neonPrimary} />
          </View>
        </BlurView>
      </View>

      {/* Download Modal */}
      <Modal visible={isDownloadModalOpen} transparent animationType="fade" onRequestClose={handleCloseDownloadModal}>
        <View style={styles.modalOverlay}>
          <View style={styles.downloadModal}>
            <LinearGradient colors={['#1a1a1a', '#2a2a2a']} style={styles.modalGradient}>
              <View style={styles.modalHeader}>
                <Ionicons name="download" size={24} color={c.neonPrimary} />
                <Text style={styles.modalTitle}>{shareMode ? t('player.share') : t('components.download')}</Text>
                <TouchableOpacity style={styles.closeButton} onPress={handleCloseDownloadModal}>
                  <Ionicons name="close" size={20} color="#888" />
                </TouchableOpacity>
              </View>
              <View style={styles.modalContent}>
                <View style={styles.trackInfo}>
                  <Image
                    source={{ uri: MusicAPI.getOptimalImage(track.images) }}
                    style={styles.modalAlbumArt}
                    contentFit="cover"
                  />
                  <View style={styles.trackDetails}>
                    <Text style={styles.trackTitle} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={styles.trackArtist} numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </View>
                </View>
                <View style={styles.statusContainer}>
                  {downloadStatus === 'idle' && (
                    <Text style={styles.statusText}>{t('components.preparing_download')}</Text>
                  )}
                  {downloadStatus === 'downloading' && (
                    <>
                      <ActivityIndicator size="large" color={c.neonPrimary} style={styles.spinner} />
                      <Text style={styles.statusText}>{t('components.downloading')}</Text>
                      <Text style={styles.statusText}>{t('components.download_hint')}</Text>
                      <View style={styles.downloadProgressContainer}>
                        <View style={styles.downloadProgressBar}>
                          <View style={[styles.progressFillBar, { width: `${downloadProgress}%`, backgroundColor: c.neonPrimary }]} />
                        </View>
                        <Text style={styles.progressText}>{downloadProgress}%</Text>
                      </View>
                    </>
                  )}
                  {downloadStatus === 'success' && (
                    <>
                      <Ionicons name="checkmark-circle" size={48} color={c.neonPrimary} style={styles.successIcon} />
                      <Text style={styles.successText}>{t('components.download_complete')}</Text>
                    </>
                  )}
                  {downloadStatus === 'error' && (
                    <>
                      <Ionicons name="alert-circle" size={48} color="#ff4444" style={styles.errorIcon} />
                      <Text style={styles.errorText}>{t('components.download_failed')}</Text>
                      <Text style={styles.errorSubtext}>{downloadError}</Text>
                      <TouchableOpacity
                        style={[styles.retryButton, { backgroundColor: c.neonPrimary }]}
                        onPress={() => {
                          handleCloseDownloadModal();
                          setTimeout(() => handleShare(), 300);
                        }}
                      >
                        <Text style={styles.retryButtonText}>{t('components.try_again')}</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            </LinearGradient>
          </View>
        </View>
      </Modal>

      <FullScreenPlayer
        isOpen={isFullScreenOpen}
        onClose={() => setIsFullScreenOpen(false)}
        track={track}
        isPlaying={isPlaying}
        onPlayingChange={onPlayingChange}
        position={position}
        duration={duration}
        onSeek={handleSeek}
        volume={volume}
        onVolumeChange={handleVolumeChange}
        isMuted={isMuted}
        onMuteToggle={handleMute}
        onNext={handleNext}
        onPrevious={handlePrevious}
        onShuffle={handleShuffle}
        musicQueue={musicQueue}
        onQueueToggle={onQueueToggle}
      />
    </>
  );
}


const styles = StyleSheet.create({
  cardContainer: {
    width: '100%',
  },
  cardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: space.sm,
    paddingBottom: 2,
    paddingHorizontal: space.md,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardAlbumArt: {
    marginRight: space.md,
  },
  cardInfoArea: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    ...type.bodyMedium,
    fontSize: 16,
  },
  cardArtist: {
    ...type.label,
    fontSize: 12,
  },
  cardIconButton: {
    marginLeft: space.xs,
    padding: space.sm,
    borderRadius: radii.pill,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  downloadModal: {
    width: '85%',
    maxWidth: 360,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  modalGradient: {
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  closeButton: {
    padding: 5,
  },
  modalContent: {
    paddingVertical: 10,
  },
  trackInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalAlbumArt: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 10,
  },
  trackDetails: {
    flex: 1,
  },
  trackTitle: {
    ...type.titleMedium,
    marginBottom: 2,
  },
  trackArtist: {
    ...type.label,
  },
  statusContainer: {
    alignItems: 'center',
    marginTop: 10,
  },
  statusText: {
    ...type.body,
    marginBottom: 10,
  },
  spinner: {
    marginBottom: 10,
  },
  downloadProgressContainer: {
    alignItems: 'center',
  },
  downloadProgressBar: {
    width: '100%',
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 5,
  },
  progressFillBar: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 14,
    color: '#888',
  },
  successIcon: {
    marginBottom: 10,
  },
  successText: {
    ...type.title,
    marginBottom: 5,
  },
  successSubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  errorIcon: {
    marginBottom: 10,
  },
  errorText: {
    ...type.title,
    color: '#ff4444',
    marginBottom: 5,
  },
  errorSubtext: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    ...type.bodyMedium,
    textAlign: 'center',
  },
  visualProgressBarContainer: {
    width: '100%',
    height: 5,
    backgroundColor: 'transparent',
    margin: 0,
    padding: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  visualProgressBarBg: {
    width: '100%',
    height: 5,
    backgroundColor: '#222',
    borderRadius: 0,
    overflow: 'hidden',
    margin: 0,
    padding: 0,
  },
  visualProgressBarFill: {
    height: 10,
    backgroundColor: '#fff',
    borderRadius: 0,
    margin: 0,
    padding: 0,
  },
  songTitleContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 8,
  },
  songTitleText: {
    ...type.titleMedium,
    textAlign: 'center',
    width: '100%',
    letterSpacing: 0.2,
  },
  whiteProgressBarBg: {
    marginHorizontal: 16,
    height: 3,
    backgroundColor: '#fff',
    opacity: 0.18,
    borderRadius: 1.5,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 10, // More breathing room
  },
  whiteProgressBarFill: {
    height: 3,
    backgroundColor: '#fff',
    opacity: 1,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cardroot: {
    width: '100%',
    backgroundColor: 'transparent',
    borderRadius: radii.lg,
    overflow: 'hidden', // Master clip
    flexDirection: 'column',
    borderWidth: 1.5,
    borderBottomWidth: 0,
    marginBottom: space.xs,
  },
});