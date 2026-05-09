export type YouTubeProviderTier = 'invidious' | 'piped' | 'ytdlp';

export type StreamResult = {
  audioUrl: string;
  providerTier: YouTubeProviderTier;
  mimeType?: string;
  bitrate?: number;
  expiresAt?: number;
};

export class AllProvidersFailedError extends Error {
  readonly videoId: string;

  constructor(videoId: string, cause?: unknown) {
    super(`All YouTube providers failed for video: ${videoId}`);
    this.name = 'AllProvidersFailedError';
    this.videoId = videoId;
    if (cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}
