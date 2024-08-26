# Subsonic-API <a href="https://www.npmjs.com/package/subsonic-api"><img src="https://img.shields.io/npm/v/subsonic-api?style=flat&colorA=000000&colorB=efefef"/></a> <a href="https://github.com/explodingcamera/subsonic-api/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/explodingcamera/subsonic-api/test.yml?branch=main&style=flat&colorA=000000"/></a>

A simple API library for interacting with Subsonic/Opensubsonic-compatible servers written in TypeScript. Supports Node.js >= 18, bun >= 1 and modern Browsers. 3kb minified and gzipped.

## Installation

```bash
$ npm install subsonic-api # or
$ bun add subsonic-api
```

## Example Usage

You can also try out the example on CodeSandbox [here](https://codesandbox.io/p/sandbox/subsonic-api-nlgp4c).

```ts
import { SubsonicAPI } from "subsonic-api";

const api = new SubsonicAPI({
  url: "https://demo.navidrome.org",
  auth: {
    username: "demo",
    password: "demo",
  },
});

const { randomSongs } = await api.getRandomSongs();
console.log(randomSongs);
```

## API

`subsonic-api` supports all of the Subsonic API methods as documented [here](http://www.subsonic.org/pages/api.jsp), up to API version 1.16.1 / Subsonic 6.1.4. Additionally, most of [OpenSubsonic's new API methods](https://opensubsonic.netlify.app/) are also supported.
All methods return a promise that resolves to the JSON response from the server.

Additionally, the following methods are available:

### `new SubsonicAPI`

```ts
new SubsonicAPI(config: SubsonicConfig)
```

Creates a new SubsonicAPI instance.

```ts
interface SubsonicConfig {
  // The base URL of the Subsonic server, e.g., https://demo.navidrome.org.
  url: string;

  // The authentication details to use when connecting to the server.
  auth: {
    username: string;
    password: string;
  };

  // A salt to use when hashing the password
  salt?: string;

  // Whether to reuse generated salts. If not provided,
  // a random salt will be generated for each request.
  // Ignored if `salt` is provided.
  reuseSalt?: boolean;

  // Whether to use a POST requests instead of GET requests.
  // Only supported by OpenSubsonic compatible servers with the `formPost` extension.
  post?: boolean;

  // The fetch implementation to use. If not provided, the global fetch will be used.
  fetch?: Fetch;

  // The crypto implementation to use. If not provided, the global WebCrypto object
  // or the Node.js crypto module will be used.
  crypto?: WebCrypto;
}
```

### `navidromeSession`

```ts
subsonicSession(): Promise<SessionInfo>
```

Creates a new Navidrome session

```ts
interface SessionInfo {
  id: string;
  isAdmin: boolean;
  name: string;
  subsonicSalt: string;
  subsonicToken: string;
  token: string;
  username: string;
}
```

### `baseURL`

```ts
baseURL(): string
```

Returns the base URL of the server. Useful for interacting with other APIs like Navidrome's.

### `custom`

```ts
custom(method: string, params: Params): Promise<Response>
```

Allows you to make a custom request to the server.

### `customJSON`

```ts
customJSON<T>(method: string, params: Params): Promise<T>
```

Allows you to make a custom request to the server and parse the response as JSON.
