# YouTube cascade — API inventory (OpenSpot Android)

Operation-specific chains are implemented in `YouTubeAdapter`. User-facing code never selects a tier. **No API keys** are required: Invidious → Piped → `youtube-sr` (scrape) for discovery; Invidious → Piped (+ optional yt-dlp) for streams.

## Tier: Invidious-compatible instance pool (`invidious`)

- **Search**: `GET {instance}/api/v1/search?q=&type=video|channel|playlist|...`
- **Trending**: `GET {instance}/api/v1/trending?type=music&region=US`
- **Playlist tracks**: `GET {instance}/api/v1/playlists/{playlistId}`
- **Channel videos**: `GET {instance}/api/v1/channels/{id}/videos` (+ continuation)
- **Stream metadata**: `GET {instance}/api/v1/videos/{videoId}?fields=adaptiveFormats`
- **Playback URL**: best `audio/*` from `adaptiveFormats`, or `{instance}/latest_version?id=&itag=&local=true`
- **Instances**: optional `EXPO_PUBLIC_YT_API_INSTANCES`, optional `EXPO_PUBLIC_YT_API_DISCOVERY`, bundled extra list from `ytmusicextraapi.json`.

## Tier: Piped (`piped`)

- **Search**: `GET {instance}/search?q=&filter=videos|channels|playlists`
- **Trending**: `GET {instance}/trending?region=US`
- **Playlist**: `GET {instance}/playlists/{id}`
- **Channel**: `GET {instance}/channel/{id}` (tabbed content)
- **Streams**: `GET {instance}/streams/{videoId}` → `audioStreams[].url`
- **Instances**: `EXPO_PUBLIC_PIPED_INSTANCES`, default `https://pipedapi.kavin.rocks`

## Tier: youtube-sr (`youtube_sr` — scraped Innertube HTML)

- **Search**: `YouTube.search` / trending MUSIC — **separate dependency** from HTTP proxy tiers.
- **Playlist expansion**: `YouTube.getPlaylist` when proxies fail.

## Tier: yt-dlp (`ytdlp`)

- **Status**: stub when `EXPO_PUBLIC_YTDLP_ENABLED` is not `1`.

## Normalized types

- `StreamResult` — `{ audioUrl, providerTier, ... }` (see `types.ts`)
- `AllProvidersFailedError` — thrown when every stream tier fails for a `videoId`.
