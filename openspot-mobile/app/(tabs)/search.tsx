import React, { useContext, useEffect } from 'react';
import { View, StyleSheet, StatusBar, Dimensions, ScrollView, TouchableOpacity, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSearch } from '@/hooks/useSearch';
import { TopBar } from '@/components/TopBar';
import { SearchResults } from '@/components/SearchResults';
import { MusicPlayerContext } from '@/src/context/MusicPlayerContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { useLocalSearchParams } from 'expo-router';
import { darkColors, lightColors } from '@/src/ui/theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function SearchScreen() {
  const searchState = useSearch();
  const { handleTrackSelect, musicQueue, isPlaying, currentTrack } = useContext(MusicPlayerContext);
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';
  const c = isDark ? darkColors : lightColors;
  const background = isDark ? '#05060A' : '#f5efe6';
  const params = useLocalSearchParams();

  useEffect(() => {
    if (params.q && typeof params.q === 'string') {
      searchState.setQuery(params.q);
      if (params.type && typeof params.type === 'string') {
        searchState.setSearchType(params.type as 'track' | 'album' | 'artist' | 'playlist');
      }
      searchState.searchTracks(params.q, params.type as 'track' | 'album' | 'artist' | 'playlist');
    }
  }, [params, searchState]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={background} translucent={false} />
      <TopBar
        currentView="search"
        onViewChange={() => {}}
        onSearchClick={() => {}}
        onSearchStart={() => {}}
        searchState={searchState}
        placeholderFontSize={SCREEN_WIDTH > 400 ? 18 : 15}
      />
      
      {!searchState.query && (
        <View style={styles.genreContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.genreScroll}>
            {['Rock', 'Metal', 'Latin', 'Reggaeton', 'Pop', 'Electronic', 'Jazz', 'Hip Hop'].map((genre) => (
              <TouchableOpacity
                key={genre}
                style={[styles.genreBubble, { backgroundColor: isDark ? '#111214' : '#FFFFFF', borderColor: c.outline }]}
                onPress={() => {
                  searchState.setQuery(genre);
                  searchState.searchTracks(genre);
                }}
              >
                <Text style={[styles.genreText, { color: isDark ? '#FFFFFF' : '#1A3300' }]}>{genre}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.mainContent}>
        <SearchResults
          searchState={searchState}
          onTrackSelect={handleTrackSelect}
          onAddToQueue={musicQueue.addToQueue}
          isPlaying={isPlaying}
          currentTrack={currentTrack}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  genreContainer: {
    paddingVertical: 16, // Extra space for shadows
  },
  genreScroll: {
    paddingHorizontal: 16,
    paddingBottom: 4, // Prevent bottom cut
  },
  genreBubble: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 25,
    marginRight: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  genreText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  mainContent: {
    paddingTop: 4,
    flex: 1,
    paddingHorizontal: 2,
  },
});
