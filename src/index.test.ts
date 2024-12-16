import { beforeAll, describe, expect, test } from "bun:test";

import { SubsonicAPI } from ".";

let api: SubsonicAPI;
describe("basic", () => {
	beforeAll(() => {
		api = new SubsonicAPI({
			url: process.env.SUBSONIC_URL!,
			auth: {
				password: process.env.SUBSONIC_PASS!,
				username: process.env.SUBSONIC_USER!,
			},
		});
	});

	test("ping", async () => {
		const { status } = await api.ping();
		expect(status).toBe("ok");
	});

	test("basic usage", async () => {
		// Fetch music folders
		const { musicFolders } = await api.getMusicFolders();
		expect(musicFolders.musicFolder).toBeDefined();
		const folderId = musicFolders.musicFolder?.[0]?.id;
		expect(folderId).toBeDefined();

		// Fetch artists from the first music folder
		const { artists } = await api.getArtists({ musicFolderId: folderId! });
		expect(artists.index?.length).toBeGreaterThan(0);
		const artistId = artists.index?.[0]?.artist?.[0].id;
		expect(artistId).toBeDefined();

		// Fetch albums for the first artist
		const { artist } = await api.getArtist({ id: artistId! });
		expect(artist.album?.length).toBeGreaterThan(0);
		const albumId = artist?.album?.[0]?.id;
		expect(albumId).toBeDefined();

		// Fetch songs from the first album
		const albumInfo = await api.getAlbum({ id: albumId! });
		expect(albumInfo.album.songCount).toBeGreaterThan(0);
		const songId = albumInfo.album.song?.[0].id;
		expect(songId).toBeDefined();

		// Star the song
		const starResponse = await api.star({ id: songId });
		expect(starResponse.status).toBe("ok");

		// Unstar the song
		const unstarResponse = await api.unstar({ id: songId });
		expect(unstarResponse.status).toBe("ok");
	});

	test("additional API usage scenarios", async () => {
		// Fetch random songs
		const { randomSongs } = await api.getRandomSongs();
		expect(randomSongs.song?.length).toBeGreaterThan(0);
		const randomSongId = randomSongs.song?.[0]?.id;
		expect(randomSongId).toBeDefined();

		// Fetch a song by ID
		const songInfo = await api.getSong({ id: randomSongId! });

		expect(songInfo.song.id).toBe(randomSongId!);
		expect(songInfo.song.title).toBeDefined();

		// Check user favorites
		const { starred } = await api.getStarred();
		expect(starred.song?.length).toBeDefined();

		// Create and delete a playlist
		const { playlist } = await api.createPlaylist({
			name: "Test Playlist",
			songId: [randomSongId!],
		});
		expect(playlist?.id).toBeDefined();

		const playlistInfo = await api.getPlaylist({ id: playlist?.id! });
		expect(playlistInfo.playlist.entry?.length).toBeGreaterThan(0);

		const deleteResponse = await api.deletePlaylist({ id: playlist?.id! });
		expect(deleteResponse.status).toBe("ok");

		// Check server ping
		const pingResponse = await api.ping();
		expect(pingResponse.status).toBe("ok");

		// Get music folder details
		const { musicFolders } = await api.getMusicFolders();
		const folderId = musicFolders.musicFolder?.[0]?.id;
		const folderDetails = await api.getIndexes({ musicFolderId: folderId! });
		expect(folderDetails.indexes?.index?.length).toBeGreaterThan(0);

		// Test searching
		const { searchResult2 } = await api.search2({ query: "" });
		expect(searchResult2.song?.length).toBeGreaterThan(0);
		expect(searchResult2.album?.length).toBeGreaterThan(0);
		expect(searchResult2.artist?.length).toBeGreaterThan(0);

		const { searchResult3 } = await api.search3({ query: "" });
		expect(searchResult3.song?.length).toBeGreaterThan(0);
		expect(searchResult3.album?.length).toBeGreaterThan(0);
		expect(searchResult3.artist?.length).toBeGreaterThan(0);
	});
});
