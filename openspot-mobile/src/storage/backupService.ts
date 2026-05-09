import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { PlaylistStorage, type Playlist } from '@/lib/playlist-storage';
import { getAllLikesOrderedNewestFirst, upsertLike, type LikedSong } from '@/src/storage/likesRepo';
import { Track } from '@/types/music';

export interface BackupPayload {
  version: number;
  playlists: Playlist[];
  playlistTracks: Record<string, Track>;
  likes: LikedSong[];
  exportedAt: string;
}

export const BackupService = {
  async exportData(): Promise<void> {
    try {
      const playlists = await PlaylistStorage.getPlaylists();
      const likes = await getAllLikesOrderedNewestFirst();
      
      const playlistTracks: Record<string, Track> = {};
      for (const pl of playlists) {
        for (const trackId of pl.trackIds) {
          if (!playlistTracks[trackId]) {
            const track = await PlaylistStorage.getTrackData(trackId);
            if (track) {
              playlistTracks[trackId] = track;
            }
          }
        }
      }
      
      const payload: BackupPayload = {
        version: 1,
        playlists,
        playlistTracks,
        likes,
        exportedAt: new Date().toISOString(),
      };
      
      const jsonString = JSON.stringify(payload, null, 2);
      const fileUri = `${FileSystem.documentDirectory}openspot_backup_${Date.now()}.json`;
      
      await FileSystem.writeAsStringAsync(fileUri, jsonString);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export OpenSpot Data',
        });
      }
    } catch (error) {
      console.error('[BackupService] Export failed:', error);
      throw error;
    }
  },
  
  async importData(): Promise<void> {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      
      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }
      
      const fileUri = result.assets[0].uri;
      const jsonString = await FileSystem.readAsStringAsync(fileUri);
      const payload = JSON.parse(jsonString) as Partial<BackupPayload>;
      
      if (payload.playlists) {
        const existingPlaylists = await PlaylistStorage.getPlaylists();
        const existingNames = new Set(existingPlaylists.map(p => p.name));
        
        const merged = [...existingPlaylists];
        for (const pl of payload.playlists) {
          if (!existingNames.has(pl.name)) {
            merged.push(pl);
          }
        }
        await PlaylistStorage.savePlaylists(merged);
      }
      
      if (payload.playlistTracks) {
        for (const track of Object.values(payload.playlistTracks)) {
          await PlaylistStorage.saveTrackData(track);
        }
      }
      
      if (payload.likes) {
        for (const like of payload.likes) {
          await upsertLike(like);
        }
      }
      
    } catch (error) {
      console.error('[BackupService] Import failed:', error);
      throw error;
    }
  }
};
