# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v3.4.0 - 2026-09-17

### Added

- Support for the `indexBasedQueue` extension with `getPlayQueueByIndex` and `savePlayQueueByIndex`
- Support for the `sonicSimilarity` extension with `getSonicSimilarTracks` and `findSonicPath`
- Support for the `transcoding` extension with `getTranscodeDecision` and `getTranscodeStream`
- Support for the `topSongsByArtistId` extension
- Support for version 2 of the `songLyrics` extension, including enhanced word-level timing and lyric layers
- `tokenInfo` support for the `apiKeyAuthentication` extension
- `getCoverArtURL` and `streamURL` helpers for passing authenticated media URLs to external components
- Generic `SubsonicResponse<T>` response type

### Fixed

- Corrected the `getLyricsBySongId` response type to use the `lyricsList` response structure
- API key authentication no longer requires an unused crypto implementation

## v3.3.0 - 2026-05-10

### Fixed

- `updateUser` now calls correct endpoint (was incorrectly calling `createUser`)
- `getTopSongs` now requires `artist` parameter as per spec
- `setRating` rating type restricted to `0 | 1 | 2 | 3 | 4 | 5`
- `star` and `unstar` now support arrays
- `createShare` now supports multiple id parameters
- Date fields typed as `Date | string` (JSON returns strings)
- `getAlbumList` / `getAlbumList2` missing `starred` and `byGenre` type options
- `createPlaylist` `name` is now optional (required only for new playlists)
- `savePlayQueue` `id` now supports arrays
- `scrobble` `id` now supports arrays for multiple files
- `stream` `size` is now correctly typed as `string` (e.g., "640x480")
- `updateUser` role parameters are now `boolean`
- Date fields are now correctly parsed to `Date` objects
- `SubsonicBaseResponse` is now properly typed with status/error/OpenSubsonic variants
