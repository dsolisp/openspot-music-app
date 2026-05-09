import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Linking,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useColorScheme } from '@/hooks/useColorScheme';
import { ThemeMode, useThemeMode } from '@/hooks/theme-mode';
import { useTranslation } from 'react-i18next';
import { BlurView } from 'expo-blur';
import { Chip } from '@/src/ui/components';
import { darkColors, glass, lightColors, radii, space, type } from '@/src/ui/theme/tokens';

interface UseSearchReturn {
  query: string;
  setQuery: (query: string) => void;
  results: any[];
  albums: any[];
  artists: any[];
  playlists: any[];
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  searchType: 'track' | 'album' | 'artist' | 'playlist';
  setSearchType: (type: 'track' | 'album' | 'artist' | 'playlist') => void;
  searchTracks: (searchQuery: string, type?: 'track' | 'album' | 'artist' | 'playlist') => Promise<void>;
  loadMore: () => Promise<void>;
  clearResults: () => void;
}

interface TopBarProps {
  currentView: 'home' | 'search';
  onViewChange: (view: 'home' | 'search') => void;
  onSearchClick: () => void;
  onSearchStart: () => void;
  searchState: UseSearchReturn;
  placeholderFontSize?: number;
  autoFocus?: boolean;
}

export function TopBar({
  currentView,
  onViewChange,
  onSearchClick,
  onSearchStart,
  searchState,
  placeholderFontSize = 16,
  autoFocus,
}: TopBarProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const c = isDark ? darkColors : lightColors;
  const accent = c.neonPrimary;
  const { mode, setMode } = useThemeMode();
  const { t } = useTranslation();
  const { query, setQuery, searchTracks, clearResults, searchType, setSearchType } = searchState;
  const router = useRouter();

  const handleSearchSubmit = () => {
    if (query.trim()) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      searchTracks(query.trim(), searchType);
      onSearchStart();
    }
  };

  const handleSearchTypeToggle = (type: 'track' | 'album' | 'artist' | 'playlist') => {
    setSearchType(type);
  };

  const handleSearchChange = (text: string) => {
    setQuery(text);
    
    if (!text.trim()) {
      clearResults();
    }
  };

  const handleBackPress = () => {
    if (!query.trim()) {
      router.push('/');
    } else {
      onViewChange('home');
      clearResults();
      setQuery('');
    }
  };

  const handleSearchFocus = () => {
    onSearchClick();
  };

  const handleSearchBlur = () => {
  };

  const handleTitlePress = () => {
    Linking.openURL('https://github.com/BlackHatDevX/openspot-music-app');
  };

  const modeOptions: ThemeMode[] = ['light', 'dark', 'auto'];

  return (
    <View style={styles.container}>
      <BlurView
        tint={isDark ? 'dark' : 'light'}
        intensity={glass.blur}
        style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? 'rgba(5,6,10,0.70)' : 'rgba(255,255,255,0.55)' }]}
      />
      <View style={styles.content}>
        {currentView === 'search' && (
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <Ionicons name="arrow-back" size={24} color={isDark ? '#fff' : '#111'} />
          </TouchableOpacity>
        )}

        <View style={styles.centerContent}>
          {currentView === 'home' ? (
            <TouchableOpacity onPress={handleTitlePress} activeOpacity={0.8}>
              <Text style={[styles.title, styles.homeTitle, { color: accent }]}>A U R A</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.searchViewContainer}>
              <View
                style={[
                  styles.searchContainer,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',
                    borderColor: `rgba(255,255,255,0.16)`,
                  },
                ]}
              >
                <TextInput
                  style={[styles.searchInput, { fontSize: placeholderFontSize, color: isDark ? '#fff' : '#2d2219' }]}
                  placeholder={t('components.search_placeholder')}
                  placeholderTextColor={isDark ? '#888' : '#8a6e5a'}
                  value={query}
                  onChangeText={handleSearchChange}
                  onSubmitEditing={handleSearchSubmit}
                  onFocus={handleSearchFocus}
                  onBlur={handleSearchBlur}
                  autoFocus={autoFocus || currentView === 'search'}
                  returnKeyType="search"
                />
                {query.length > 0 && (
                  <TouchableOpacity
                    style={styles.clearButton}
                    onPress={() => handleSearchChange('')}
                  >
                    <Ionicons name="close-circle" size={20} color={isDark ? '#888' : '#8a6e5a'} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.searchSubmitButton}
                  onPress={handleSearchSubmit}
                  disabled={!query.trim()}
                >
                  <Ionicons
                    name="search"
                    size={18}
                    color={query.trim() ? accent : isDark ? "#444" : "#b8a08c"}
                  />
                </TouchableOpacity>
              </View>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false} 
                style={styles.searchTypeScroll}
                contentContainerStyle={styles.searchTypeToggle}
              >
                <Chip label={t('components.songs_tab')} selected={searchType === 'track'} onPress={() => handleSearchTypeToggle('track')} />
                <Chip label={t('components.albums_tab')} selected={searchType === 'album'} onPress={() => handleSearchTypeToggle('album')} />
                <Chip label={t('components.artists_tab')} selected={searchType === 'artist'} onPress={() => handleSearchTypeToggle('artist')} />
                <Chip label={t('components.playlists_tab')} selected={searchType === 'playlist'} onPress={() => handleSearchTypeToggle('playlist')} />
              </ScrollView>
            </View>
          )}
        </View>

        {currentView === 'home' && (
          <View style={styles.homeActions}>
            <TouchableOpacity
              style={[styles.homeSearchButton, { backgroundColor: isDark ? '#1a1a1a' : '#fffaf2' }]}
              onPress={onSearchClick}
              activeOpacity={0.85}
            >
              <Ionicons name="search" size={18} color={accent} />
            </TouchableOpacity>
            <View style={[styles.modeSwitcher, { backgroundColor: isDark ? '#1a1a1a' : '#fffaf2' }]}>
              {modeOptions.map((option) => {
                const isActive = mode === option;
                return (
                  <TouchableOpacity
                    key={option}
                    style={[styles.modeButton, isActive && [styles.modeButtonActive, { backgroundColor: accent }]]}
                    onPress={() => setMode(option)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[
                        styles.modeButtonText,
                        { color: isDark ? '#888' : '#8a6e5a' },
                        isActive && styles.modeButtonTextActive,
                      ]}
                    >
                      {option === 'auto' ? t('components.theme_auto') : option === 'light' ? t('components.theme_light') : t('components.theme_dark')}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: space.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.10)',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  backButton: {
    marginRight: 16,
    padding: 8,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    ...type.title,
    textAlign: 'center',
    letterSpacing: 6, // Aura atmosphere
    textTransform: 'uppercase',
  },
  homeTitle: {
    textAlign: 'left',
    marginLeft: 8,
  },
  searchViewContainer: {
    gap: space.sm,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    paddingHorizontal: space.md,
    height: 40,
  },
  searchInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: 40,
  },
  clearButton: {
    marginLeft: 8,
    padding: 2,
  },
  searchSubmitButton: {
    marginLeft: 8,
    padding: 4,
  },
  modeSwitcher: {
    borderRadius: 16,
    flexDirection: 'row',
    padding: 3,
  },
  homeActions: {
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  homeSearchButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modeButtonActive: {},
  modeButtonText: {
    fontSize: 11,
    fontWeight: '700',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  searchTypeScroll: {
    marginTop: -4, // Pull closer to search bar
    marginHorizontal: -space.md, // Bleed to edges
    paddingHorizontal: space.md,
  },
  searchTypeToggle: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 8,
    paddingRight: 32, // Space for scrolling end
  },
});