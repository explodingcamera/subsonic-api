# Subsonic-API <a href="https://www.npmjs.com/package/subsonic-api"><img src="https://img.shields.io/npm/v/subsonic-api?style=flat&colorA=000000&colorB =000000"/></a>

A simple API library for interacting with Subsonic-compatible servers

## Installation

```bash
$ npm install subsonic-api
```

## Example Usage

```ts
import { Subsonic } from "subsonic-api";

const api = new Subsonic({
  url: "https://demo.subsonic.org",
  type: "subsonic", // or "generic" or "navidrome"
});

await api.login({
  username: "guest3",
  password: "guest",
});

const { randomSongs } = await subsonic.getRandomSongs();
```

## API

`subsonic-api` supports all of the Subsonic API methods as documented [here](https://www.subsonic.org/pages/api.jsp), up to version 1.16.1.
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
