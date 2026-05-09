import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';

import { useThemeMode, ThemeModeProvider } from '@/hooks/theme-mode';
import { LikedSongsProvider } from '@/hooks/useLikedSongs';
import { useApiStatus } from '@/hooks/useApiStatus';
import '@/lib/i18n';
import { queryClient } from '@/src/state/queryClient';
import { migrateLegacyAsyncStorageIfNeeded, migrateLibraryFromAsyncStorageIfNeeded, mirrorPlaylistsToAsyncStorage } from '@/src/storage/migrateFromAsyncStorage';
import { MusicAPI } from '@/lib/music-api';

SplashScreen.preventAutoHideAsync();

function AppNavigation() {
  const { resolvedScheme } = useThemeMode();
  useApiStatus();

  return (
    <LikedSongsProvider>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style={resolvedScheme === 'dark' ? 'light' : 'dark'} />
    </LikedSongsProvider>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  useEffect(() => {
    void (async () => {
      try {
        await MusicAPI.ensureYouTubeProviderDefault();
        await migrateLegacyAsyncStorageIfNeeded();
        await migrateLibraryFromAsyncStorageIfNeeded();
        await mirrorPlaylistsToAsyncStorage();
      } catch (e) {
        console.warn('[OpenSpot] storage bootstrap', e);
      }
    })();
  }, []);

  if (!loaded) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <ThemeModeProvider>
          <AppNavigation />
        </ThemeModeProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}