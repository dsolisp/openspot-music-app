import TrackPlayer, { Event } from 'react-native-track-player';

export default async function trackPlayerService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());

  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    try {
      await TrackPlayer.skipToNext();
      await TrackPlayer.play();
    } catch {}
  });

  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try {
      await TrackPlayer.skipToPrevious();
      await TrackPlayer.play();
    } catch {}
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, async (e) => {
    try {
      const position = (e as { position?: number }).position ?? 0;
      await TrackPlayer.seekTo(position);
    } catch {}
  });
}

