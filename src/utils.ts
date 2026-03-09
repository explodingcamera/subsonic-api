export function arrayBufferToBase64(bytes: Uint8Array) {
	if (typeof globalThis.Buffer !== "undefined" && Buffer.isEncoding("base64url")) {
		return Buffer.from(bytes).toString("base64url");
	}

	let binary = "";
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}

	return globalThis.btoa(binary).replace(/\+/g, "~").replace(/\//g, "_").replace(/=/g, "");
}

export function createDateReviver(keys: string[]) {
	const keySet = new Set(keys);
	return (key: string, value: unknown) => {
		if (keySet.has(key) && typeof value === "string") {
			return new Date(value);
		}
		return value;
	};
}
