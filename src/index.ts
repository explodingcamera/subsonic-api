import md5 from "spark-md5";

import type {
	AlbumID3,
	AlbumInfo,
	AlbumList,
	AlbumList2,
	ArtistInfo,
	ArtistInfo2,
	ArtistsID3,
	ArtistWithAlbumsID3,
	Bookmarks,
	ChatMessages,
	Directory,
	Genres,
	Indexes,
	InternetRadioStations,
	License,
	MusicFolders,
	NewestPodcasts,
	NowPlaying,
	Playlist,
	Playlists,
	PlayQueue,
	Podcasts,
	ScanStatus,
	SearchResult2,
	SearchResult3,
	Shares,
	SimilarSongs,
	SimilarSongs2,
	Songs,
	Starred,
	Starred2,
	TopSongs,
	User,
	Users,
	VideoInfo,
	Videos,
} from "./types.js";
export * from "./types.js";

import { arrayBufferToBase64 } from "./utils.js";

export interface SubsonicConfig {
	url: string;
	type: "subsonic" | "generic" | "navidrome";
}

export type Params = Record<string, string | string[] | number | number[] | boolean | undefined>;

export interface SubsonicBaseResponse {
	status: string;
	version: string;
	type: string;
	serverVersion: string;
}

export default class SubsonicAPI {
	#config: SubsonicConfig;
	#fetch?: typeof fetch;
	#crypto?: Crypto;
	#user?: { username: string; password: string };

	authenticated = false;

	constructor(config: SubsonicConfig) {
		this.#config = config;
	}

	async init() {
		this.#crypto = globalThis.crypto
			? globalThis.crypto
			: await import("crypto").then((crypto) => crypto.webcrypto as Crypto);

		if (globalThis.fetch) {
			this.#fetch = globalThis.fetch.bind(globalThis);
		} else if (typeof window !== "undefined") {
			this.#fetch = (await import("node-fetch")).default as unknown as typeof fetch;
		} else {
			throw new Error("fetch not available");
		}
	}

	async login({ username, password }: { username: string; password: string }) {
		await this.init();

		this.#user = { username, password };
		this.authenticated = true;

		try {
			await this.ping();
		} catch (error: unknown) {
			this.#user = undefined;
			this.authenticated = false;
			throw error;
		}
	}

	async navidromeSession() {
		await this.init();
		if (this.#config.type !== "navidrome")
			throw new Error("navidromeSession is only available for navidrome");
		if (!this.#user) throw new Error("not authenticated");

		const base = this.baseURL();
		const response = await this.#fetch!(`${base}auth/login`, {
			method: "POST",
			body: JSON.stringify({ username: this.#user?.username, password: this.#user?.password }),
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

	#generateSalt() {
		if (!this.#crypto) throw new Error("crypto not available");

		return arrayBufferToBase64(this.#crypto.getRandomValues(new Uint8Array(16)));
	}

	#generateToken(password: string) {
		const salt = this.#generateSalt();

		return {
			salt,
			token: md5.hash(password + salt),
		};
	}

	async custom(method: string, params: Params) {
		return this.#request(method, params);
	}

	async customJSON<T>(method: string, params: Params) {
		return this.#requestJSON<T>(method, params);
	}

	async #requestJSON<T>(method: string, args?: Params) {
		return this.#request(method, args)
			.then(async (res) => res.json())
			.then(async (res) => res?.["subsonic-response"] as Promise<T>);
	}

	baseURL() {
		let base = this.#config.url;
		if (!base.startsWith("http")) base = `https://${base}`;
		if (!base.endsWith("/")) base += "/";
		return base;
	}

	async #request(method: string, params?: Params) {
		if (!this.authenticated) throw new Error("not authenticated");
		if (!this.#user) throw new Error("not authenticated");
		if (!this.#fetch) throw new Error("not authenticated");

		let base = this.baseURL();
		if (!base.endsWith("rest/")) base += "rest/";

		base += `${method}.view`;

		const url = new URL(base);
		url.searchParams.set("v", "1.16.1");
		url.searchParams.set("c", "subsonic-api");
		url.searchParams.set("f", "json");
		url.searchParams.set("u", this.#user.username);

		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (typeof value === "undefined") continue;
				if (Array.isArray(value)) {
					for (const v of value) {
						url.searchParams.append(key, v.toString());
					}
				} else {
					url.searchParams.set(key, value.toString());
				}
			}
		}

		const { token, salt } = this.#generateToken(this.#user.password);
		url.searchParams.set("t", token);
		url.searchParams.set("s", salt);

		return this.#fetch(url.toString(), {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});
	}

	// ----------
	// SYSTEM API
	// ----------

	async ping() {
		return this.#requestJSON<SubsonicBaseResponse>("ping", {});
	}

	async getLicense() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				license: License;
			}
		>("getLicense", {});
	}

	// ------------
	// BROWSING API
	// ------------

	async getMusicFolders() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				musicFolders: MusicFolders;
			}
		>("getMusicFolders", {});
	}

	async getIndexes(args?: {
		musicFolderId?: string;
		ifModifiedSince?: number;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				indexes: Indexes;
			}
		>("getIndexes", args);
	}

	async getMusicDirectory(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				directory: Directory;
			}
		>("getMusicDirectory", args);
	}

	async getGenres() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				genres: Genres;
			}
		>("getGenres", {});
	}

	async getArtists(args?: { musicFolderId?: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				artists: ArtistsID3;
			}
		>("getArtists", args);
	}

	async getArtist(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				artist: ArtistWithAlbumsID3;
			}
		>("getArtist", args);
	}

	async getAlbum(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				album: AlbumID3;
			}
		>("getAlbum", args);
	}

	async getSong(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				song: AlbumID3;
			}
		>("getSong", args);
	}

	async getVideos(args?: { musicFolderId?: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				videos: Videos;
			}
		>("getVideos", args);
	}

	async getVideoInfo(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				videoInfo: VideoInfo;
			}
		>("getVideoInfo", args);
	}

	async getArtistInfo(args: {
		id: string;
		count?: number;
		includeNotPresent?: boolean;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				artistInfo: ArtistInfo;
			}
		>("getArtistInfo", args);
	}

	async getArtistInfo2(args: {
		id: string;
		count?: number;
		includeNotPresent?: boolean;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				artistInfo2: ArtistInfo2;
			}
		>("getArtistInfo2", args);
	}

	async getAlbumInfo(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				albumInfo: AlbumInfo;
			}
		>("getAlbumInfo", args);
	}

	async getAlbumInfo2(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				albumInfo: AlbumInfo;
			}
		>("getAlbumInfo2", args);
	}

	async getSimilarSongs(args: { id: string; count?: number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				similarSongs: SimilarSongs;
			}
		>("getSimilarSongs", args);
	}

	async getSimilarSongs2(args: { id: string; count?: number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				similarSongs2: SimilarSongs2;
			}
		>("getSimilarSongs2", args);
	}

	async getTopSongs(args: { count?: number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				topSongs: TopSongs;
			}
		>("getTopSongs", args);
	}

	async getAlbumList(args: {
		type:
			| "alphabeticalByName"
			| "alphabeticalByArtist"
			| "byYear"
			| "random"
			| "newest"
			| "highest"
			| "frequent"
			| "recent";
		size?: number;
		offset?: number;
		fromYear?: number;
		toYear?: number;
		genre?: string;
		musicFolderId?: string;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				albumList: AlbumList;
			}
		>("getAlbumList", args);
	}

	async getAlbumList2(args: {
		type:
			| "alphabeticalByName"
			| "alphabeticalByArtist"
			| "byYear"
			| "random"
			| "newest"
			| "highest"
			| "frequent"
			| "recent";
		size?: number;
		offset?: number;
		fromYear?: number;
		toYear?: number;
		genre?: string;
		musicFolderId?: string;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				albumList2: AlbumList2;
			}
		>("getAlbumList2", args);
	}

	async getRandomSongs(args?: {
		size?: number;
		genre?: string;
		fromYear?: number;
		toYear?: number;
		musicFolderId?: string;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				randomSongs: Songs;
			}
		>("getRandomSongs", args);
	}

	async getSongsByGenre(args: {
		genre: string;
		count?: number;
		offset?: number;
		musicFolderId?: string;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				songsByGenre: Songs;
			}
		>("getSongsByGenre", args);
	}

	async getNowPlaying() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				nowPlaying: NowPlaying;
			}
		>("getNowPlaying", {});
	}

	async getStarred(args?: { musicFolderId?: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				starred: Starred;
			}
		>("getStarred", args);
	}

	async getStarred2(args?: { musicFolderId?: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				starred2: Starred2;
			}
		>("getStarred2", args);
	}

	/**
	 * @deprecated Deprecated since 1.4.0, use search2 instead.
	 */
	async search(args?: {
		artist?: string;
		album?: string;
		title?: string;
		any?: string;
		count?: number;
		offset?: number;
		newerThan: number;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				searchResult2: SearchResult2;
			}
		>("search2", args);
	}

	async search2(args: {
		query: string;
		artistCount?: number;
		artistOffset?: number;
		albumCount?: number;
		albumOffset?: number;
		songCount?: number;
		songOffset?: number;
		musicFolderId?: string;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				searchResult2: SearchResult2;
			}
		>("search2", args);
	}

	async search3(args: {
		query: string;
		artistCount?: number;
		artistOffset?: number;
		albumCount?: number;
		albumOffset?: number;
		songCount?: number;
		songOffset?: number;
		musicFolderId?: string;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				searchResult3: SearchResult3;
			}
		>("search3", args);
	}

	async getPlaylists(args?: { username?: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				playlists: Playlists;
			}
		>("getPlaylists", args);
	}

	async getPlaylist(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				playlist: Playlist;
			}
		>("getPlaylist", args);
	}

	async createPlaylist(args: {
		playlistId?: string;
		name: string;
		songId?: string[];
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				playlist: Playlist;
			}
		>("createPlaylist", args);
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
		>("updatePlaylist", args);
	}

	async deletePlaylist(args: { id: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				playlist: Playlist;
			}
		>("deletePlaylist", args);
	}

	async stream(args: {
		id: string;
		maxBitRate?: number;
		format?: "raw" | "mp3" | "ogg" | "aac";
		timeOffset?: number;
		size?: number;
		estimateContentLength?: boolean;
		converted?: boolean;
	}) {
		return this.#request("stream", args);
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
		return this.#request("download", args);
	}

	async hls(args: { id: string; bitRate?: number; audioTrack?: number }) {
		return this.#request("hls", args);
	}

	async getCaptions(args: { id: string }) {
		return this.#request("getCaptions", args);
	}

	async getCoverArt(args: { id: string; size?: number }) {
		return this.#request("getCoverArt", args);
	}

	async getLyrics(args: { artist?: string; title?: string }) {
		return this.#request("getLyrics", args);
	}

	async getAvatar(args: { username: string; size?: number }) {
		return this.#request("getAvatar", args);
	}

	async star(args: { id?: string; albumId?: string; artistId?: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("star", args);
	}

	async unstar(args: { id?: string; albumId?: string; artistId?: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("star", args);
	}

	async setRating(args: { id: string; rating: number }) {
		return this.#requestJSON<SubsonicBaseResponse>("setRating", args);
	}

	async scrobble(args: { id: string; submission?: boolean; time?: number }) {
		return this.#requestJSON<SubsonicBaseResponse>("scrobble", args);
	}

	async getShares() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				shares: Shares;
			}
		>("getShares", {});
	}

	async createShare(args: {
		id: string;
		description?: string;
		expires?: number;
	}) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				shares: Shares;
			}
		>("createShare", args);
	}

	async updateShare(args: {
		id: string;
		description?: string;
		expires?: number;
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("updateShare", args);
	}

	async deleteShare(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deleteShare", args);
	}

	async getPodcasts(args?: { id?: string; includeEpisodes?: boolean }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				podcasts: Podcasts;
			}
		>("getPodcasts", args);
	}

	async getNewestPodcasts(args?: { since?: number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				newestPodcasts: NewestPodcasts;
			}
		>("getNewestPodcasts", args);
	}

	async refreshPodcasts() {
		return this.#requestJSON<SubsonicBaseResponse>("refreshPodcasts", {});
	}

	async createPodcastChannel(args: { url: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("createPodcastChannel", args);
	}

	async deletePodcastChannel(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deletePodcastChannel", args);
	}

	async deletePodcastEpisode(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deletePodcastEpisode", args);
	}

	async downloadPodcastEpisode(args: { id: string }) {
		return this.#request("downloadPodcastEpisode", args);
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
		id?: string;
		offset?: number;
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("jukeboxControl", args);
	}

	async getInternetRadioStations() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				internetRadioStations: InternetRadioStations;
			}
		>("getInternetRadioStations", {});
	}

	async createInternetRadioStation(args: {
		name: string;
		streamUrl: string;
		homepageUrl?: string;
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("createInternetRadioStation", args);
	}

	async updateInternetRadioStation(args: {
		id: string;
		name?: string;
		streamUrl?: string;
		homepageUrl?: string;
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("updateInternetRadioStation", args);
	}

	async deleteInternetRadioStation(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deleteInternetRadioStation", args);
	}

	async getChatMessages(args?: { since?: number }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				chatMessages: ChatMessages;
			}
		>("getChatMessages", args);
	}

	async addChatMessage(args: { message: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("addChatMessage", args);
	}

	async getUser(args?: { username?: string }) {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				user: User;
			}
		>("getUser", args);
	}

	async getUsers() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				users: Users;
			}
		>("getUsers", {});
	}

	async createUser(args: {
		username: string; // The name of the new user.
		password: string; // The password of the new user, either in clear text of hex-encoded (see above).
		email: string; // The email address of the new user.

		ldapAuthenticated?: string; //	Whether the user is authenicated in LDAP.
		adminRole?: string; //	Whether the user is administrator.
		settingsRole?: string; //	Whether the user is allowed to change personal settings and password.
		streamRole?: string; //	Whether the user is allowed to play files.
		jukeboxRole?: string; //	Whether the user is allowed to play files in jukebox mode.
		downloadRole?: string; //	Whether the user is allowed to download files.
		uploadRole?: string; //	Whether the user is allowed to upload files.
		playlistRole?: string; //	Whether the user is allowed to create and delete playlists. Since 1.8.0, changing this role has no effect.
		coverArtRole?: string; //	Whether the user is allowed to change cover art and tags.
		commentRole?: string; //	Whether the user is allowed to create and edit comments and ratings.
		podcastRole?: string; //	Whether the user is allowed to administrate Podcasts.
		shareRole?: string; //	(Since 1.8.0) Whether the user is allowed to share files with anyone.
		videoConversionRole?: string; //	(Since 1.15.0) Whether the user is allowed to start video conversions.
		musicFolderId?: string[]; // (Since 1.12.0) IDs of the music folders the user is allowed access to.
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("createUser", args);
	}

	async updateUser(args: {
		username: string; // The name of the new user.
		password: string; // The password of the new user, either in clear text of hex-encoded (see above).
		email: string; // The email address of the new user.

		ldapAuthenticated?: string; // Whether the user is authenicated in LDAP.
		adminRole?: string; // Whether the user is administrator.
		settingsRole?: string; //	Whether the user is allowed to change personal settings and password.
		streamRole?: string; //	Whether the user is allowed to play files.
		jukeboxRole?: string; // Whether the user is allowed to play files in jukebox mode.
		downloadRole?: string; //	Whether the user is allowed to download files.
		uploadRole?: string; //	Whether the user is allowed to upload files.
		playlistRole?: string; //	Whether the user is allowed to create and delete playlists. Since 1.8.0, changing this role has no effect.
		coverArtRole?: string; //	Whether the user is allowed to change cover art and tags.
		commentRole?: string; // Whether the user is allowed to create and edit comments and ratings.
		podcastRole?: string; // Whether the user is allowed to administrate Podcasts.
		shareRole?: string; // (Since 1.8.0) Whether the user is allowed to share files with anyone.
		videoConversionRole?: string; // (Since 1.15.0) Whether the user is allowed to start video conversions.
		musicFolderId?: string[]; // (Since 1.12.0) IDs of the music folders the user is allowed access to.
		maxBitRate?: string; //	(Since 1.13.0) The maximum bit rate for this user. 0 = no limit.
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("createUser", args);
	}

	async deleteUser(args: { username: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deleteUser", args);
	}

	async changePassword(args: { username: string; password: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("changePassword", args);
	}

	async getBookmarks() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				bookmarks: Bookmarks;
			}
		>("getBookmarks", {});
	}

	async createBookmark(args: {
		id: string;
		position: number;
		comment?: string;
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("createBookmark", args);
	}

	async deleteBookmark(args: { id: string }) {
		return this.#requestJSON<SubsonicBaseResponse>("deleteBookmark", args);
	}

	async getPlayQueue() {
		return this.#requestJSON<
			| SubsonicBaseResponse &
					Partial<{
						playQueue: PlayQueue;
					}>
		>("getPlayQueue", {});
	}

	async savePlayQueue(args: {
		id: string;
		current?: string;
		position: number;
	}) {
		return this.#requestJSON<SubsonicBaseResponse>("savePlayQueue", args);
	}

	async getScanStatus() {
		return this.#requestJSON<
			SubsonicBaseResponse & {
				scanStatus: ScanStatus;
				lastScan?: number;
				folderCount?: number;
			}
		>("getScanStatus", {});
	}

	/**
	 * @description Start scanning media library. (fullScan is only supported by Navidrome)
	 */
	async startScan(args?: { fullScan?: boolean }) {
		return this.#requestJSON<SubsonicBaseResponse>("startScan", args);
	}
}

export { SubsonicAPI };
