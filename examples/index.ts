import { SubsonicAPI } from "../src";

const api = new SubsonicAPI({
	url: "https://demo.navidrome.org",
	auth: {
		password: "demo",
		username: "demo",
	},
	fetch,
});

const res = await api.ping();

if (res.openSubsonic) {
	console.log(`Connected to a ${res.type} server with support for OpenSubsonic`);
} else {
	console.log(`Connected to a Subsonic ${res.version} server`);
}

export { api };
