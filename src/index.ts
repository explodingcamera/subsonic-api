import { md5 } from "./md5.js";
import { arrayBufferToBase64, createDateReviver } from "./utils.js";

// biome-ignore format: too much
import type { AlbumInfo, AlbumList, AlbumList2, AlbumWithSongsID3, ArtistInfo, ArtistInfo2, ArtistWithAlbumsID3, ArtistsID3, Bookmarks, ChatMessages, Child, Directory, Genres, Indexes, InternetRadioStations, JukeboxPlaylist, JukeboxStatus, License, Lyrics, MusicFolders, NewestPodcasts, NowPlaying, OpenSubsonicExtensions, PlayQueue, Playlist, PlaylistWithSongs, Playlists, PodcastEpisode, Podcasts, ScanStatus, SearchResult2, SearchResult3, Shares, SimilarSongs, SimilarSongs2, Songs, Starred, Starred2, StructuredLyrics, TopSongs, User, Users, VideoInfo, Videos } from "./types.js";
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
	 * Whether to use a POST requests instead of GET requests.
	 *
	 * Only supported by OpenSubsonic compatible servers with the `formPost` extension.
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
		if (!this.#crypto && !this.#config.salt)
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
		return arrayBufferToBase64(this.#crypto.getRandomValues(new Uint8Array(16)));
	}

	async #generateToken(password: string) {
		let salt = this.#config.salt;
		if (!salt || !this.#config.reuseSalt) salt = await this.#generateSalt();
		if (this.#config.reuseSalt) this.#config.salt = salt;
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

	async #requestJSON<T>(method: string, args?: Record<string, unknown>, dateKeys: string[] = []) {
		return this.#request(method, args)
			.then(async (res) => res.text())
			.then((text) => {
				const data = dateKeys.length > 0 ? JSON.parse(text, createDateReviver(dateKeys)) : JSON.parse(text);
				return data?.["subsonic-response"] as T;
			});
	}

	async getAlbum(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				album: AlbumWithSongsID3;
			}
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

	/**
 	* Builds a complete URL for a Subsonic API request with authentication and query parameters.
 	*/
	async buildUrl(method: string, params: Record<string, unknown>) {
		return this.#buildUrl(method, params);
	}

	async #buildUrl(method: string, params?: Record<string, unknown>): Promise<URL> {
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

		return url
	}

	async #request(method: string, params?: Record<string, unknown>) {
		const url = await this.#buildUrl(method, params)

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
	 * List the OpenSubsonic extensions supported by this server.\
	 * Only supported by OpenSubsonic compatible servers.
	 *
	 * https://opensubsonic.netlify.app/docs/endpoints/getopensubsonicextensions/
	 */
	async getOpenSubsonicExtensions() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				openSubsonicExtensions: OpenSubsonicExtensions[];
			}
		>("getOpenSubsonicExtensions.view", {});
	}

	/**
	 * Get structured lyrics for a song.\
	 * Only supported by OpenSubsonic compatible servers with the `songLyrics` extension.
	 *
	 * https://opensubsonic.netlify.app/docs/endpoints/getlyricsbysongid/
	 */
	async getLyricsBySongId(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				lyricsList: StructuredLyrics[];
			}
		>("getLyricsBySongId.view", args);
	}

	// ----------
	// SYSTEM API
	// ----------

	async ping() {
		return this.#requestJSON<SubsonicBaseResponse>("ping.view", {});
	}

	async getLicense() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				license: License;
			}
		>("getLicense.view", {});
	}

	// ------------
	// BROWSING API
	// ------------

	async getMusicFolders() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				musicFolders: MusicFolders;
			}
		>("getMusicFolders.view", {});
	}

	async getIndexes(args?: { musicFolderId?: string | number; ifModifiedSince?: number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				indexes: Indexes;
			}
		>("getIndexes.view", args, ["starred"]);
	}

	async getMusicDirectory(args: { id: string | number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				directory: Directory;
			}
		>("getMusicDirectory.view", args, ["created", "starred"]);
	}

	async getGenres() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				genres: Genres;
			}
		>("getGenres.view", {});
	}

	async getArtists(args?: { musicFolderId?: string | number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				artists: ArtistsID3;
			}
		>("getArtists.view", args, ["starred"]);
	}

	async getArtist(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				artist: ArtistWithAlbumsID3;
			}
		>("getArtist.view", args, ["starred"]);
	}

	async getSong(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				song: Child;
			}
		>("getSong.view", args, ["created", "starred"]);
	}

	async getVideos(args?: { musicFolderId?: string | number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				videos: Videos;
			}
		>("getVideos.view", args, ["created", "starred"]);
	}

	async getVideoInfo(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				videoInfo: VideoInfo;
			}
		>("getVideoInfo.view", args, ["created"]);
	}

	async getArtistInfo(args: { id: string; count?: number; includeNotPresent?: boolean }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				artistInfo: ArtistInfo;
			}
		>("getArtistInfo.view", args);
	}

	async getArtistInfo2(args: { id: string; count?: number; includeNotPresent?: boolean }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				artistInfo2: ArtistInfo2;
			}
		>("getArtistInfo2.view", args);
	}

	async getAlbumInfo(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				albumInfo: AlbumInfo;
			}
		>("getAlbumInfo.view", args);
	}

	async getAlbumInfo2(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				albumInfo: AlbumInfo;
			}
		>("getAlbumInfo2.view", args);
	}

	async getSimilarSongs(args: { id: string; count?: number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				similarSongs: SimilarSongs;
			}
		>("getSimilarSongs.view", args);
	}

	async getSimilarSongs2(args: { id: string; count?: number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				similarSongs2: SimilarSongs2;
			}
		>("getSimilarSongs2.view", args);
	}

	async getTopSongs(args: { artist: string; count?: number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				topSongs: TopSongs;
			}
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
			SubsonicBaseResponse & {
				albumList: AlbumList;
			}
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
			SubsonicBaseResponse & {
				albumList2: AlbumList2;
			}
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
			SubsonicBaseResponse & {
				randomSongs: Songs;
			}
		>("getRandomSongs.view", args, ["created", "starred"]);
	}

	async getSongsByGenre(args: {
		genre: string;
		count?: number;
		offset?: number;
		musicFolderId?: string | number;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				songsByGenre: Songs;
			}
		>("getSongsByGenre.view", args, ["created", "starred"]);
	}

	async getNowPlaying() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				nowPlaying: NowPlaying;
			}
		>("getNowPlaying.view", {});
	}

	async getStarred(args?: { musicFolderId?: string | number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				starred: Starred;
			}
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
			SubsonicBaseResponse & {
				starred2: Starred2;
			}
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
			SubsonicBaseResponse & {
				searchResult2: SearchResult2;
			}
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
			SubsonicBaseResponse & {
				searchResult3: SearchResult3;
			}
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
			SubsonicBaseResponse & {
				playlists: Playlists;
			}
		>("getPlaylists.view", args, ["created", "changed", "starred"]);
	}

	async getPlaylist(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				playlist: PlaylistWithSongs;
			}
		>("getPlaylist.view", args, ["created", "changed", "starred"]);
	}

	async createPlaylist(args: { playlistId?: string; name?: string; songId?: string[] }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				playlist: PlaylistWithSongs;
			}
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
			SubsonicBaseResponse & {
				playlist: Playlist;
			}
		>("updatePlaylist.view", args, ["created", "changed", "starred"]);
	}

	async deletePlaylist(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				playlist: Playlist;
			}
		>("deletePlaylist.view", args);
	}

	async stream(args: {
		id: string;
		maxBitRate?: number;
		format?: "raw" | "mp3" | "ogg" | "aac";
		timeOffset?: number;
		size?: string;
		estimateContentLength?: boolean;
		converted?: boolean;
	}) {
		return this.#request("stream.view", args);
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

	async getCoverArt(args: { id: string; size?: number }) {
		return this.#request("getCoverArt.view", args);
	}

	async getLyrics(args: { artist?: string; title?: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				lyrics: Lyrics;
			}
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

	async getShares() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				shares: Shares;
			}
		>("getShares.view", {});
	}

	async createShare(args: { id: string | string[]; description?: string; expires?: number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				shares: Shares;
			}
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
			SubsonicBaseResponse & {
				podcasts: Podcasts;
			}
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
			SubsonicBaseResponse & {
				newestPodcasts: NewestPodcasts;
			}
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
	 * Returns details for a podcast episode.
	 * Only supported by OpenSubsonic compatible servers with the `getPodcastEpisode` extension.
	 *
	 * https://opensubsonic.netlify.app/docs/endpoints/getPodcastEpisode/
	 */
	async getPodcastEpisode(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				podcastEpisode: PodcastEpisode;
			}
		>("getPodcastEpisode.view", args);
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
			SubsonicBaseResponse & {
				jukeboxStatus: JukeboxStatus;
				jukeboxPlaylist: JukeboxPlaylist;
			}
		>("jukeboxControl.view", args);
	}

	async getInternetRadioStations() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				internetRadioStations: InternetRadioStations;
			}
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
			SubsonicBaseResponse & {
				chatMessages: ChatMessages;
			}
		>("getChatMessages.view", args);
	}

	async addChatMessage(args: { message: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("addChatMessage.view", args);
	}

	async getUser(args?: { username?: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				user: User;
			}
		>("getUser.view", args);
	}

	async getUsers() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				users: Users;
			}
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
		ldapAuthenticated?: string;
		/** Whether the user is administrator. */
		adminRole?: string;
		/** Whether the user is allowed to change personal settings and password. */
		settingsRole?: string;
		/** Whether the user is allowed to play files. */
		streamRole?: string;
		/** Whether the user is allowed to play files in jukebox mode. */
		jukeboxRole?: string;
		/** Whether the user is allowed to download files. */
		downloadRole?: string;
		/** Whether the user is allowed to upload files. */
		uploadRole?: string;
		/** Whether the user is allowed to create and delete playlists. Since 1.8.0, changing this role has no effect. */
		playlistRole?: string;
		/** Whether the user is allowed to change cover art and tags. */
		coverArtRole?: string;
		/** Whether the user is allowed to create and edit comments and ratings. */
		commentRole?: string;
		/** Whether the user is allowed to administrate Podcasts. */
		podcastRole?: string;
		/** (Since 1.8.0) Whether the user is allowed to share files with anyone. */
		shareRole?: string;
		/** (Since 1.15.0) Whether the user is allowed to start video conversions. */
		videoConversionRole?: string;
		/** (Since 1.12.0) IDs of the music folders the user is allowed access to. */
		musicFolderId?: (string | number)[];
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("createUser.view", args);
	}

	async updateUser(args: {
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
			SubsonicBaseResponse & {
				bookmarks: Bookmarks;
			}
		>("getBookmarks.view", {});
	}

	async createBookmark(args: { id: string; position: number; comment?: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("createBookmark.view", args);
	}

	async deleteBookmark(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deleteBookmark.view", args);
	}

	async getPlayQueue() {
		return this.#requestJSON<SubsonicBaseResponse & Partial<{ playQueue: PlayQueue }>>(
			"getPlayQueue.view",
			{},
		);
	}

	/**
	 * @param args.id Optional on OpenSubsonic-compatible servers
	 */
	async savePlayQueue(args: { id?: string | string[]; current?: string; position: number }) {
		return this.#requestJSON<SubsonicBaseResponse>("savePlayQueue.view", args);
	}

	async getScanStatus() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				scanStatus: ScanStatus;
				/** Only supported by Navidrome */
				lastScan?: Date | string;
				/** Only supported by Navidrome */
				folderCount?: number;
			}
		>("getScanStatus.view", {}, ["lastScan"]);
	}

	/**
	 * Start scanning the media library.
	 * @param args.fullScan Only supported by navidrome - whether to do a full scan, or just an incremental scan.
	 */
	async startScan(args?: { fullScan?: boolean }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				scanStatus: ScanStatus;
			}
		>("startScan.view", args);
	}
}

export { SubsonicAPI };
