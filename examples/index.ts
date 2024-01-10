import { SubsonicAPI } from "../lib";

const api = new SubsonicAPI({
	url: "https://demo.navidrome.org",
	type: "navidrome", // or "generic" or "subsonic"
});

await api.login({
	username: "demo",
	password: "demo",
});

export { api };
