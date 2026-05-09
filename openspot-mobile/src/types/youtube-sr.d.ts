/** youtube-sr package.json exports omit "types" — satisfy TS moduleResolution. */
declare module 'youtube-sr' {
  export class Video {
    id: string;
    title: string;
    duration?: number;
    thumbnail?: { displayThumbnailURL?: (q: string) => string };
    channel?: { name?: string };
  }

  export class Channel {
    id: string;
    name?: string;
    url?: string;
    verified?: boolean;
    iconURL?: (params: { size: number }) => string;
  }

  export class Playlist {
    id: string;
    title?: string;
    url?: string;
    videoCount?: number;
    thumbnail?: { displayThumbnailURL?: (q: string) => string };
    channel?: { name?: string };
    videos: Video[];
  }

  export class YouTube {
    static search(
      query: string,
      opts: { limit: number; type: 'video' | 'channel' | 'playlist' }
    ): Promise<(Video | Channel | Playlist)[]>;
    static trending(opts: { type: 'MUSIC' | string }): Promise<Video[]>;
    static getPlaylist(
      url: string,
      opts: { limit: number }
    ): Promise<Playlist>;
  }

  export default YouTube;
}

