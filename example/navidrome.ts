import { SubsonicAPI } from "../lib";

const api = new SubsonicAPI({
	url: "https://demo.navidrome.org",
	type: "navidrome", // or "generic" or "subsonic"
});

await api.login({
	username: "demo",
	password: "demo",
});

const { artists } = await api.getArtists();
const allArtists = artists.index?.flatMap((i) => i.artist) ?? [];

const firstArtist = allArtists[0];
const session = await api.navidromeSession();

// https://www.reddit.com/r/navidrome/comments/wrxxkj/documentation_for_the_navidrome_api/
// https://github.com/navidrome/navidrome/blob/f941347cf189387b0bca8c9cac7c747e343b5b10/server/nativeapi/native_api.go#L34-L57
const albumAPI = new URL(`${api.baseURL()}api/album`);
albumAPI.searchParams.set("_end", "0");
albumAPI.searchParams.set("_order", "ASC");
albumAPI.searchParams.set("_sort", "max_year");
albumAPI.searchParams.set("_start", "0");
albumAPI.searchParams.set("artist_id", firstArtist!.id);

const album = await fetch(albumAPI, {
	headers: { "X-ND-Authorization": `Bearer ${session.token}` },
});

console.log(await album.json());
