import { md5 } from "./md5.js";
import { arrayBufferToBase64, createDateReviver } from "./utils.js";

// biome-ignore format: too much
import type { AlbumInfo, AlbumList, AlbumList2, AlbumWithSongsID3, ArtistInfo, ArtistInfo2, ArtistWithAlbumsID3, ArtistsID3, Bookmarks, ChatMessages, Child, ClientInfo, Directory, Genres, Indexes, InternetRadioStations, JukeboxPlaylist, JukeboxStatus, License, Lyrics, LyricsList, MusicFolders, NewestPodcasts, NowPlaying, OpenSubsonicExtensions, PlayQueue, PlayQueueByIndex, Playlist, PlaylistWithSongs, Playlists, PodcastEpisode, Podcasts, ScanStatus, SearchResult2, SearchResult3, Shares, SimilarSongs, SimilarSongs2, SonicMatch, Songs, Starred, Starred2, TokenInfo, TopSongs, TranscodeDecision, User, Users, VideoInfo, Videos } from "./types.js";
export * from "./types.js";

interface SubsonicConfig {
	/** The base URL of the Subsonic server, e.g., https://demo.navidrome.org. */
	url: string;

	/** The authentication details to use when connecting to the server. */
	auth:
		| {
				username: string;
				password: string;
				apiKey?: never;
		  }
		| {
				username?: never;
				password?: never;
				/** An API key supported by the OpenSubsonic `apiKeyAuthentication` extension. */
				apiKey: string;
		  };

	/** A salt to use when hashing the password (optional). */
	salt?: string;

	/**
	 * Whether to reuse generated salts.
	 *
	 * If not provided, a random salt will be generated for each request.
	 *
	 * Ignored if `salt` is provided.
	 */
	reuseSalt?: boolean;

	/**
	 * Whether to use POST requests instead of GET requests.
	 *
	 * Only supported by OpenSubsonic compatible servers with the `formPost` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/extensions/formpost/
	 */
	post?: boolean;

	/** The fetch implementation to use. If not provided, the global fetch will be used. */
	fetch?: typeof fetch;

	/**
	 * The crypto implementation to use.
	 *
	 * If not provided, the global WebCrypto object or the Node.js crypto module will be used.
	 */
	crypto?: Crypto;
}

/** Parameters accepted by the `stream` endpoint. */
export interface StreamParams {
	id: string;
	maxBitRate?: number;
	format?: "raw" | "mp3" | "ogg" | "aac";
	timeOffset?: number;
	size?: string;
	estimateContentLength?: boolean;
	converted?: boolean;
}

/** Parameters accepted by the `getCoverArt` endpoint. */
export interface CoverArtParams {
	id: string;
	size?: number;
}

export type SubsonicBaseResponse = (
	| {
			status: "ok";
	  }
	| {
			status: "failed";
			error: SubsonicError;
	  }
) &
	(
		| {
				openSubsonic?: false;
				version: string;
		  }
		| {
				version: string;
				openSubsonic: true;
				type: string;
				serverVersion: string;
		  }
	);

/**
 * A Subsonic response with endpoint-specific fields.
 *
 * @typeParam T - The fields returned by the endpoint.
 */
export type SubsonicResponse<T extends object> = SubsonicBaseResponse & T;

export interface SubsonicError {
	code: number;
	message?: string;
	helpUrl?: string;
}

export default class SubsonicAPI {
	#config: SubsonicConfig;
	#fetch: typeof fetch;
	#crypto?: Crypto;

	constructor(config: SubsonicConfig) {
		if (!config) throw new Error("no config provided");
		if (!config.url) throw new Error("no url provided");
		if (!config.auth) throw new Error("no auth provided");

		if (!config.auth.apiKey) {
			if (!config.auth.username) throw new Error("no username provided");
			if (!config.auth.password) throw new Error("no password provided");
		}

		this.#config = config;
		this.#crypto = config.crypto || globalThis.crypto;
		if (!this.#crypto && !this.#config.salt && !this.#config.auth.apiKey)
			throw new Error("no crypto implementation available. Provide a salt or crypto implementation.");

		this.#fetch = (config.fetch || globalThis.fetch).bind(globalThis);
		if (!this.#fetch) throw new Error("no fetch implementation available");
	}

	/**
	 * Connect to the auth api of a navidrome server and fetch the session token.
	 */
	async navidromeSession() {
		const base = this.baseURL();
		const response = await this.#fetch!(`${base}auth/login`, {
			method: "POST",
			body: JSON.stringify({ username: this.#config.auth.username, password: this.#config.auth.password }),
		});

		if (!response.ok) return Promise.reject(response.statusText);

		const data: {
			id: string;
			isAdmin: boolean;
			name: string;
			subsonicSalt: string;
			subsonicToken: string;
			token: string;
			username: string;
		} = await response.json();

		return data;
	}

	async #generateSalt() {
		if (!this.#crypto) {
			try {
				this.#crypto = await import("node:crypto").then((crypto) => (crypto as any).webcrypto as Crypto);
			} catch (_) {
				throw new Error("crypto not available");
			}
		}
		return arrayBufferToBase64(this.#crypto!.getRandomValues(new Uint8Array(16)));
	}

	async #generateToken(password: string) {
		let salt = this.#config.salt;
		if (!salt) {
			salt = await this.#generateSalt();
			if (this.#config.reuseSalt) this.#config.salt = salt;
		}
		return {
			salt,
			token: md5(password + salt),
		};
	}

	/**
	 * Make a custom request to the Subsonic server.
	 */
	async custom(method: string, params: Record<string, unknown>) {
		return this.#request(method, params);
	}

	/**
	 * Make a custom JSON request to the Subsonic server.
	 */
	async customJSON<T>(method: string, params: Record<string, unknown>) {
		return this.#requestJSON<T>(method, params);
	}

	async #requestJSON<T>(
		method: string,
		args?: Record<string, unknown>,
		dateKeys: string[] = [],
		jsonBody?: unknown,
	) {
		return this.#request(method, args, jsonBody)
			.then(async (res) => res.text())
			.then((text) => {
				const data = dateKeys.length > 0 ? JSON.parse(text, createDateReviver(dateKeys)) : JSON.parse(text);
				return data?.["subsonic-response"] as T;
			});
	}

	async getAlbum(args: { id: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				album: AlbumWithSongsID3;
			}>
		>("getAlbum.view", args, ["created", "starred"]);
	}

	/**
	 * Get the base URL of the Subsonic server.
	 */
	baseURL() {
		let base = this.#config.url;
		if (!base.startsWith("http")) base = `https://${base}`;
		if (!base.endsWith("/")) base += "/";
		return base;
	}

	async #buildURL(method: string, params?: object) {
		let base = this.baseURL();
		if (!base.endsWith("rest/")) base += "rest/";
		base += method;
		const url = new URL(base);
		url.searchParams.set("v", "1.16.1");
		url.searchParams.set("c", "subsonic-api");
		url.searchParams.set("f", "json");

		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (typeof value === "undefined" || value === null) continue;
				if (Array.isArray(value)) {
					for (const v of value) {
						url.searchParams.append(key, v.toString());
					}
				} else {
					url.searchParams.set(key, value.toString());
				}
			}
		}

		if (this.#config.auth.apiKey) {
			url.searchParams.set("apiKey", this.#config.auth.apiKey);
		} else if (this.#config.auth.username) {
			url.searchParams.set("u", this.#config.auth.username);
			const { token, salt } = await this.#generateToken(this.#config.auth.password);
			url.searchParams.set("t", token);
			url.searchParams.set("s", salt);
		} else {
			throw new Error("no auth provided");
		}

		return url;
	}

	async #request(method: string, params?: object, jsonBody?: unknown) {
		const url = await this.#buildURL(method, params);

		if (jsonBody !== undefined) {
			return this.#fetch(url.toString(), {
				method: "POST",
				body: JSON.stringify(jsonBody),
				headers: {
					"Content-Type": "application/json",
				},
			});
		}

		if (this.#config.post) {
			const [path, search] = url.toString().split("?");
			return this.#fetch(path, {
				method: "POST",
				body: search,
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
			});
		}

		return this.#fetch(url.toString(), {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});
	}

	// -----------------
	// OPENSUBSONIC APIs
	// -----------------

	/**
	 * List the OpenSubsonic extensions supported by this server.
	 * Only supported by OpenSubsonic compatible servers.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/getopensubsonicextensions/
	 */
	async getOpenSubsonicExtensions() {
		return this.#requestJSON<
			SubsonicResponse<{
				openSubsonicExtensions: OpenSubsonicExtensions[];
			}>
		>("getOpenSubsonicExtensions.view", {});
	}

	/**
	 * Get structured lyrics for a song.
	 * Set `enhanced` to true to request word-level timing and lyric layers from servers
	 * supporting version 2 of the `songLyrics` extension.
	 *
	 * Only supported by OpenSubsonic compatible servers with the `songLyrics` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/getlyricsbysongid/
	 */
	async getLyricsBySongId(args: { id: string; enhanced?: boolean }) {
		return this.#requestJSON<
			SubsonicResponse<{
				lyricsList: LyricsList;
			}>
		>("getLyricsBySongId.view", args);
	}

	/**
	 * Return information about the configured API key.
	 * Only supported by servers with the `apiKeyAuthentication` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/tokeninfo/
	 */
	async tokenInfo() {
		return this.#requestJSON<SubsonicResponse<{ tokenInfo: TokenInfo }>>("tokenInfo.view", {});
	}

	/**
	 * Return the play queue using a zero-based current track index.
	 * Only supported by servers with the `indexBasedQueue` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/getplayqueuebyindex/
	 */
	async getPlayQueueByIndex() {
		return this.#requestJSON<SubsonicResponse<{ playQueueByIndex: PlayQueueByIndex }>>(
			"getPlayQueueByIndex.view",
			{},
			["changed"],
		);
	}

	/**
	 * Save the play queue using a zero-based current track index.
	 * Pass no IDs to clear the saved queue.
	 *
	 * Only supported by servers with the `indexBasedQueue` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/saveplayqueuebyindex/
	 */
	async savePlayQueueByIndex(
		args: { id?: string | string[]; currentIndex?: number; position?: number } = {},
	) {
		return this.#requestJSON<SubsonicBaseResponse>("savePlayQueueByIndex.view", args);
	}

	/**
	 * Return tracks that are similar according to sonic analysis.
	 * Only supported by servers with the `sonicSimilarity` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/getsonicsimilartracks/
	 */
	async getSonicSimilarTracks(args: { id: string; count?: number }) {
		return this.#requestJSON<SubsonicResponse<{ sonicMatch: SonicMatch[] }>>(
			"getSonicSimilarTracks.view",
			args,
			["created", "starred"],
		);
	}

	/**
	 * Find a sequence of sonically similar tracks between two songs.
	 * Only supported by servers with the `sonicSimilarity` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/findsonicpath/
	 */
	async findSonicPath(args: { startSongId: string; endSongId: string; count?: number }) {
		return this.#requestJSON<SubsonicResponse<{ sonicMatch: SonicMatch[] }>>("findSonicPath.view", args, [
			"created",
			"starred",
		]);
	}

	/**
	 * Ask the server whether media should be played directly or transcoded.
	 * This endpoint always sends the client information as a JSON POST body.
	 *
	 * Only supported by servers with the `transcoding` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/gettranscodedecision/
	 */
	async getTranscodeDecision(args: {
		mediaId: string;
		mediaType: "song" | "podcast";
		clientInfo: ClientInfo;
	}) {
		const { clientInfo, ...params } = args;
		return this.#requestJSON<SubsonicResponse<{ transcodeDecision: TranscodeDecision }>>(
			"getTranscodeDecision.view",
			params,
			[],
			clientInfo,
		);
	}

	/**
	 * Retrieve a transcoded stream using parameters returned by `getTranscodeDecision`.
	 * Only supported by servers with the `transcoding` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/gettranscodestream/
	 */
	async getTranscodeStream(args: {
		mediaId: string;
		mediaType: "song" | "podcast";
		transcodeParams: string;
		offset?: number;
	}) {
		return this.#request("getTranscodeStream.view", args);
	}

	// ----------
	// SYSTEM API
	// ----------

	async ping() {
		return this.#requestJSON<SubsonicBaseResponse>("ping.view", {});
	}

	async getLicense() {
		return this.#requestJSON<
			SubsonicResponse<{
				license: License;
			}>
		>("getLicense.view", {});
	}

	// ------------
	// BROWSING API
	// ------------

	async getMusicFolders() {
		return this.#requestJSON<
			SubsonicResponse<{
				musicFolders: MusicFolders;
			}>
		>("getMusicFolders.view", {});
	}

	async getIndexes(args?: { musicFolderId?: string | number; ifModifiedSince?: number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				indexes: Indexes;
			}>
		>("getIndexes.view", args, ["starred"]);
	}

	async getMusicDirectory(args: { id: string | number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				directory: Directory;
			}>
		>("getMusicDirectory.view", args, ["created", "starred"]);
	}

	async getGenres() {
		return this.#requestJSON<
			SubsonicResponse<{
				genres: Genres;
			}>
		>("getGenres.view", {});
	}

	async getArtists(args?: { musicFolderId?: string | number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				artists: ArtistsID3;
			}>
		>("getArtists.view", args, ["starred"]);
	}

	async getArtist(args: { id: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				artist: ArtistWithAlbumsID3;
			}>
		>("getArtist.view", args, ["starred"]);
	}

	async getSong(args: { id: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				song: Child;
			}>
		>("getSong.view", args, ["created", "starred"]);
	}

	async getVideos(args?: { musicFolderId?: string | number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				videos: Videos;
			}>
		>("getVideos.view", args, ["created", "starred"]);
	}

	async getVideoInfo(args: { id: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				videoInfo: VideoInfo;
			}>
		>("getVideoInfo.view", args, ["created"]);
	}

	async getArtistInfo(args: { id: string; count?: number; includeNotPresent?: boolean }) {
		return this.#requestJSON<
			SubsonicResponse<{
				artistInfo: ArtistInfo;
			}>
		>("getArtistInfo.view", args);
	}

	async getArtistInfo2(args: { id: string; count?: number; includeNotPresent?: boolean }) {
		return this.#requestJSON<
			SubsonicResponse<{
				artistInfo2: ArtistInfo2;
			}>
		>("getArtistInfo2.view", args);
	}

	async getAlbumInfo(args: { id: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				albumInfo: AlbumInfo;
			}>
		>("getAlbumInfo.view", args);
	}

	async getAlbumInfo2(args: { id: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				albumInfo: AlbumInfo;
			}>
		>("getAlbumInfo2.view", args);
	}

	async getSimilarSongs(args: { id: string; count?: number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				similarSongs: SimilarSongs;
			}>
		>("getSimilarSongs.view", args);
	}

	async getSimilarSongs2(args: { id: string; count?: number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				similarSongs2: SimilarSongs2;
			}>
		>("getSimilarSongs2.view", args);
	}

	/**
	 * Return the top songs for an artist.
	 * Passing an artist ID requires the `topSongsByArtistId` extension and takes precedence over `artist`.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/gettopsongs/
	 */
	async getTopSongs(
		args: ({ artist: string; id?: string } | { artist?: string; id: string }) & {
			count?: number;
		},
	) {
		return this.#requestJSON<
			SubsonicResponse<{
				topSongs: TopSongs;
			}>
		>("getTopSongs.view", args);
	}

	async getAlbumList(args: {
		type:
			| "alphabeticalByName"
			| "alphabeticalByArtist"
			| "byYear"
			| "byGenre"
			| "random"
			| "newest"
			| "highest"
			| "frequent"
			| "recent"
			| "starred";
		size?: number;
		offset?: number;
		fromYear?: number;
		toYear?: number;
		genre?: string;
		musicFolderId?: string | number;
	}) {
		return this.#requestJSON<
			SubsonicResponse<{
				albumList: AlbumList;
			}>
		>("getAlbumList.view", args, ["created", "starred"]);
	}

	async getAlbumList2(args: {
		type:
			| "alphabeticalByName"
			| "alphabeticalByArtist"
			| "byYear"
			| "byGenre"
			| "random"
			| "newest"
			| "highest"
			| "frequent"
			| "recent"
			| "starred";
		size?: number;
		offset?: number;
		fromYear?: number;
		toYear?: number;
		genre?: string;
		musicFolderId?: string | number;
	}) {
		return this.#requestJSON<
			SubsonicResponse<{
				albumList2: AlbumList2;
			}>
		>("getAlbumList2.view", args, ["created", "starred"]);
	}

	async getRandomSongs(args?: {
		size?: number;
		genre?: string;
		fromYear?: number;
		toYear?: number;
		musicFolderId?: string | number;
	}) {
		return this.#requestJSON<
			SubsonicResponse<{
				randomSongs: Songs;
			}>
		>("getRandomSongs.view", args, ["created", "starred"]);
	}

	async getSongsByGenre(args: {
		genre: string;
		count?: number;
		offset?: number;
		musicFolderId?: string | number;
	}) {
		return this.#requestJSON<
			SubsonicResponse<{
				songsByGenre: Songs;
			}>
		>("getSongsByGenre.view", args, ["created", "starred"]);
	}

	async getNowPlaying() {
		return this.#requestJSON<
			SubsonicResponse<{
				nowPlaying: NowPlaying;
			}>
		>("getNowPlaying.view", {});
	}

	async getStarred(args?: { musicFolderId?: string | number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				starred: Starred;
			}>
		>("getStarred.view", args, [
			"created",
			"changed",
			"starred",
			"expires",
			"lastPlayed",
			"lastScan",
			"licenseExpires",
			"trialExpires",
			"publishDate",
			"lastVisited",
		]);
	}

	async getStarred2(args?: { musicFolderId?: string | number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				starred2: Starred2;
			}>
		>("getStarred2.view", args, [
			"created",
			"changed",
			"starred",
			"expires",
			"lastPlayed",
			"lastScan",
			"licenseExpires",
			"trialExpires",
			"publishDate",
			"lastVisited",
		]);
	}

	async search2(args: {
		query: string;
		artistCount?: number;
		artistOffset?: number;
		albumCount?: number;
		albumOffset?: number;
		songCount?: number;
		songOffset?: number;
		musicFolderId?: string | number;
	}) {
		return this.#requestJSON<
			SubsonicResponse<{
				searchResult2: SearchResult2;
			}>
		>("search2.view", args, [
			"created",
			"changed",
			"starred",
			"expires",
			"lastPlayed",
			"lastScan",
			"licenseExpires",
			"trialExpires",
			"publishDate",
			"lastVisited",
		]);
	}

	async search3(args: {
		query: string;
		artistCount?: number;
		artistOffset?: number;
		albumCount?: number;
		albumOffset?: number;
		songCount?: number;
		songOffset?: number;
		musicFolderId?: string | number;
	}) {
		return this.#requestJSON<
			SubsonicResponse<{
				searchResult3: SearchResult3;
			}>
		>("search3.view", args, [
			"created",
			"changed",
			"starred",
			"expires",
			"lastPlayed",
			"lastScan",
			"licenseExpires",
			"trialExpires",
			"publishDate",
			"lastVisited",
		]);
	}

	async getPlaylists(args?: { username?: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				playlists: Playlists;
			}>
		>("getPlaylists.view", args, ["created", "changed", "starred"]);
	}

	async getPlaylist(args: { id: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				playlist: PlaylistWithSongs;
			}>
		>("getPlaylist.view", args, ["created", "changed", "starred"]);
	}

	async createPlaylist(args: { playlistId?: string; name?: string; songId?: string[] }) {
		return this.#requestJSON<
			SubsonicResponse<{
				playlist: PlaylistWithSongs;
			}>
		>("createPlaylist.view", args, ["created", "changed", "starred"]);
	}

	async updatePlaylist(args: {
		playlistId: string;
		name?: string;
		comment?: string;
		public?: boolean;
		songIdToAdd?: string[];
		songIndexToRemove?: number[];
	}) {
		return this.#requestJSON<
			SubsonicResponse<{
				playlist: Playlist;
			}>
		>("updatePlaylist.view", args, ["created", "changed", "starred"]);
	}

	async deletePlaylist(args: { id: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				playlist: Playlist;
			}>
		>("deletePlaylist.view", args);
	}

	/**
	 * Stream a media file.
	 * Using `timeOffset` for music requires the `transcodeOffset` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/stream/
	 */
	async stream(args: StreamParams) {
		return this.#request("stream.view", args);
	}

	/**
	 * Build an authenticated GET URL for streaming a media file without making a request.
	 * This always returns a URL, even when the client is configured to use POST requests.
	 * Treat the returned URL as sensitive because it contains authentication credentials.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/stream/
	 */
	async streamURL(args: StreamParams) {
		return (await this.#buildURL("stream.view", args)).toString();
	}

	async download(args: {
		id: string;
		/**
		 * Only supported by Navidrome
		 */
		maxBitRate?: number;
		/**
		 * Only supported by Navidrome
		 */
		format?: "raw" | "mp3" | "ogg" | "aac";
		/**
		 * Only supported by Navidrome
		 */
		timeOffset?: number;
	}) {
		return this.#request("download.view", args);
	}

	async hls(args: { id: string; bitRate?: number; audioTrack?: number }) {
		return this.#request("hls.m3u8", args);
	}

	async getCaptions(args: { id: string; format?: "srt" | "vtt" }) {
		return this.#request("getCaptions.view", args);
	}

	async getCoverArt(args: CoverArtParams) {
		return this.#request("getCoverArt.view", args);
	}

	/**
	 * Build an authenticated GET URL for cover art without making a request.
	 * This always returns a URL, even when the client is configured to use POST requests.
	 * Treat the returned URL as sensitive because it contains authentication credentials.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/getcoverart/
	 */
	async getCoverArtURL(args: CoverArtParams) {
		return (await this.#buildURL("getCoverArt.view", args)).toString();
	}

	async getLyrics(args: { artist?: string; title?: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				lyrics: Lyrics;
			}>
		>("getLyrics.view", args);
	}

	async getAvatar(args: { username: string; size?: number }) {
		return this.#request("getAvatar.view", args);
	}

	async star(args: { id?: string | string[]; albumId?: string | string[]; artistId?: string | string[] }) {
		return this.#requestJSON<SubsonicBaseResponse>("star.view", args);
	}

	async unstar(args: { id?: string | string[]; albumId?: string | string[]; artistId?: string | string[] }) {
		return this.#requestJSON<SubsonicBaseResponse>("unstar.view", args);
	}

	async setRating(args: { id: string; rating: 0 | 1 | 2 | 3 | 4 | 5 }) {
		return this.#requestJSON<SubsonicBaseResponse>("setRating.view", args);
	}

	async scrobble(args: { id: string | string[]; submission?: boolean; time?: number }) {
		return this.#requestJSON<SubsonicBaseResponse>("scrobble.view", args);
	}

	/**
	 * Report the current playback timeline state.
	 * Only supported by servers with the `playbackReport` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/reportplayback/
	 */
	async reportPlayback(args: {
		mediaId: string;
		mediaType: "song" | "podcast";
		positionMs: number;
		state: "starting" | "playing" | "paused" | "stopped";
		playbackRate?: number;
		ignoreScrobble?: boolean;
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("reportPlayback.view", args);
	}

	async getShares() {
		return this.#requestJSON<
			SubsonicResponse<{
				shares: Shares;
			}>
		>("getShares.view", {});
	}

	async createShare(args: { id: string | string[]; description?: string; expires?: number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				shares: Shares;
			}>
		>("createShare.view", args, ["created", "expires", "lastVisited"]);
	}

	async updateShare(args: { id: string; description?: string; expires?: number }) {
		return this.#requestJSON<SubsonicBaseResponse>("updateShare.view", args);
	}

	async deleteShare(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deleteShare.view", args);
	}

	async getPodcasts(args?: { id?: string; includeEpisodes?: boolean }) {
		return this.#requestJSON<
			SubsonicResponse<{
				podcasts: Podcasts;
			}>
		>("getPodcasts.view", args, [
			"created",
			"changed",
			"starred",
			"expires",
			"lastPlayed",
			"lastScan",
			"licenseExpires",
			"trialExpires",
			"publishDate",
			"lastVisited",
		]);
	}

	async getNewestPodcasts(args?: { since?: number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				newestPodcasts: NewestPodcasts;
			}>
		>("getNewestPodcasts.view", args, ["publishDate"]);
	}

	async refreshPodcasts() {
		return this.#requestJSON<SubsonicBaseResponse>("refreshPodcasts.view", {});
	}

	async createPodcastChannel(args: { url: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("createPodcastChannel.view", args);
	}

	async deletePodcastChannel(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deletePodcastChannel.view", args);
	}

	async deletePodcastEpisode(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deletePodcastEpisode.view", args);
	}

	async downloadPodcastEpisode(args: { id: string }) {
		return this.#request("downloadPodcastEpisode.view", args);
	}

	/**
	 * Return details for a podcast episode.
	 * Only supported by OpenSubsonic compatible servers with the `getPodcastEpisode` extension.
	 *
	 * @see https://opensubsonic.netlify.app/docs/endpoints/getpodcastepisode/
	 */
	async getPodcastEpisode(args: { id: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				podcastEpisode: PodcastEpisode;
			}>
		>("getPodcastEpisode.view", args, ["created", "starred", "publishDate"]);
	}

	async jukeboxControl(args: {
		action:
			| "start"
			| "stop"
			| "skip"
			| "add"
			| "setGain"
			| "clear"
			| "shuffle"
			| "get"
			| "status"
			| "remove"
			| "set";
		index?: number;
		gain?: number;
		id?: string | string[];
		offset?: number;
	}) {
		return this.#requestJSON<
			SubsonicResponse<{
				jukeboxStatus: JukeboxStatus;
				jukeboxPlaylist: JukeboxPlaylist;
			}>
		>("jukeboxControl.view", args);
	}

	async getInternetRadioStations() {
		return this.#requestJSON<
			SubsonicResponse<{
				internetRadioStations: InternetRadioStations;
			}>
		>("getInternetRadioStations.view", {});
	}

	async createInternetRadioStation(args: { name: string; streamUrl: string; homepageUrl?: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("createInternetRadioStation.view", args);
	}

	async updateInternetRadioStation(args: {
		id: string;
		name?: string;
		streamUrl?: string;
		homepageUrl?: string;
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("updateInternetRadioStation.view", args);
	}

	async deleteInternetRadioStation(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deleteInternetRadioStation.view", args);
	}

	async getChatMessages(args?: { since?: number }) {
		return this.#requestJSON<
			SubsonicResponse<{
				chatMessages: ChatMessages;
			}>
		>("getChatMessages.view", args);
	}

	async addChatMessage(args: { message: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("addChatMessage.view", args);
	}

	async getUser(args?: { username?: string }) {
		return this.#requestJSON<
			SubsonicResponse<{
				user: User;
			}>
		>("getUser.view", args);
	}

	async getUsers() {
		return this.#requestJSON<
			SubsonicResponse<{
				users: Users;
			}>
		>("getUsers.view", {});
	}

	async createUser(args: {
		/** The name of the new user. */
		username: string;
		/** The password of the new user, either in clear text of hex-encoded (see above). */
		password: string;
		/** The email address of the new user. */
		email: string;

		/** Whether the user is authenticated in LDAP. */
		ldapAuthenticated?: boolean;
		/** Whether the user is administrator. */
		adminRole?: boolean;
		/** Whether the user is allowed to change personal settings and password. */
		settingsRole?: boolean;
		/** Whether the user is allowed to play files. */
		streamRole?: boolean;
		/** Whether the user is allowed to play files in jukebox mode. */
		jukeboxRole?: boolean;
		/** Whether the user is allowed to download files. */
		downloadRole?: boolean;
		/** Whether the user is allowed to upload files. */
		uploadRole?: boolean;
		/** Whether the user is allowed to create and delete playlists. Since 1.8.0, changing this role has no effect. */
		playlistRole?: boolean;
		/** Whether the user is allowed to change cover art and tags. */
		coverArtRole?: boolean;
		/** Whether the user is allowed to create and edit comments and ratings. */
		commentRole?: boolean;
		/** Whether the user is allowed to administrate Podcasts. */
		podcastRole?: boolean;
		/** (Since 1.8.0) Whether the user is allowed to share files with anyone. */
		shareRole?: boolean;
		/** (Since 1.15.0) Whether the user is allowed to start video conversions. */
		videoConversionRole?: boolean;
		/** (Since 1.12.0) IDs of the music folders the user is allowed access to. */
		musicFolderId?: (string | number)[];
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("createUser.view", args);
	}

	async updateUser(args: {
		/** The name of the user to update. */
		username: string;
		/** The new password, either in clear text or hex-encoded. */
		password?: string;
		/** The new email address. */
		email?: string;

		/** Whether the user is authenticated in LDAP. */
		ldapAuthenticated?: boolean;
		/** Whether the user is administrator. */
		adminRole?: boolean;
		/** Whether the user is allowed to change personal settings and password. */
		settingsRole?: boolean;
		/** Whether the user is allowed to play files. */
		streamRole?: boolean;
		/** Whether the user is allowed to play files in jukebox mode. */
		jukeboxRole?: boolean;
		/** Whether the user is allowed to download files. */
		downloadRole?: boolean;
		/** Whether the user is allowed to upload files. */
		uploadRole?: boolean;
		/** Whether the user is allowed to create and delete playlists. Since 1.8.0, changing this role has no effect. */
		playlistRole?: boolean;
		/** Whether the user is allowed to change cover art and tags. */
		coverArtRole?: boolean;
		/** Whether the user is allowed to create and edit comments and ratings. */
		commentRole?: boolean;
		/** Whether the user is allowed to administrate Podcasts. */
		podcastRole?: boolean;
		/** (Since 1.8.0) Whether the user is allowed to share files with anyone. */
		shareRole?: boolean;
		/** (Since 1.15.0) Whether the user is allowed to start video conversions. */
		videoConversionRole?: boolean;
		/** (Since 1.12.0) IDs of the music folders the user is allowed access to. */
		musicFolderId?: (string | number)[];
		/** (Since 1.13.0) The maximum bit rate for this user. 0 = no limit. */
		maxBitRate?: string;
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("updateUser.view", args);
	}

	async deleteUser(args: { username: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deleteUser.view", args);
	}

	async changePassword(args: { username: string; password: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("changePassword.view", args);
	}

	async getBookmarks() {
		return this.#requestJSON<
			SubsonicResponse<{
				bookmarks: Bookmarks;
			}>
		>("getBookmarks.view", {});
	}

	async createBookmark(args: { id: string; position: number; comment?: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("createBookmark.view", args);
	}

	async deleteBookmark(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deleteBookmark.view", args);
	}

	async getPlayQueue() {
		return this.#requestJSON<SubsonicResponse<Partial<{ playQueue: PlayQueue }>>>("getPlayQueue.view", {});
	}

	/**
	 * @param args.id Optional on OpenSubsonic-compatible servers
	 */
	async savePlayQueue(args: { id?: string | string[]; current?: string; position: number }) {
		return this.#requestJSON<SubsonicBaseResponse>("savePlayQueue.view", args);
	}

	async getScanStatus() {
		return this.#requestJSON<
			SubsonicResponse<{
				scanStatus: ScanStatus;
				/** Only supported by Navidrome */
				lastScan?: Date | string;
				/** Only supported by Navidrome */
				folderCount?: number;
			}>
		>("getScanStatus.view", {}, ["lastScan"]);
	}

	/**
	 * Start scanning the media library.
	 * @param args.fullScan Only supported by navidrome - whether to do a full scan, or just an incremental scan.
	 */
	async startScan(args?: { fullScan?: boolean }) {
		return this.#requestJSON<
			SubsonicResponse<{
				scanStatus: ScanStatus;
			}>
		>("startScan.view", args);
	}
}

export { SubsonicAPI };
