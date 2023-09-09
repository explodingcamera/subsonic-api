# Subsonic-API <a href="https://www.npmjs.com/package/subsonic-api"><img src="https://img.shields.io/npm/v/subsonic-api?style=flat&colorA=000000&colorB=efefef"/></a> <a href="https://github.com/explodingcamera/subsonic-api/actions/workflows/test.yml"><img src="https://img.shields.io/github/actions/workflow/status/explodingcamera/subsonic-api/test.yml?branch=main&style=flat&colorA=000000"/></a>

A simple API library for interacting with Subsonic-compatible servers (Up to API version 1.16.1) written in TypeScript.

## Installation

```bash
$ npm install subsonic-api
```

## Example Usage

You can also try out the example on CodeSandbox [here](https://codesandbox.io/p/sandbox/subsonic-api-nlgp4c).

```ts
import { SubsonicAPI } from "subsonic-api";

const api = new SubsonicAPI({
  url: "https://demo.navidrome.org",
  type: "navidrome", // or "generic" or "subsonic"
});

await api.login({
  username: "demo",
  password: "demo",
});

const { randomSongs } = await api.getRandomSongs();
console.log(randomSongs);
```

## API

`subsonic-api` supports all of the Subsonic API methods as documented [here](http://www.subsonic.org/pages/api.jsp), up to API version 1.16.1 / Subsonic 6.1.4.
All methods return a promise that resolves to the JSON response from the server.

Additionally, the following methods are available:

### `login`

```ts
login(options: LoginOptions): Promise<void>
```

Logs in to the server and stores the password for future requests.

```ts
interface LoginOptions {
  username: string;
  password: string;
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
