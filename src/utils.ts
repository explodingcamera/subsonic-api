export function arrayBufferToBase64(bytes: Uint8Array) {
	if (typeof globalThis.Buffer !== "undefined") {
		return Buffer.from(bytes).toString("base64");
	}

	let binary = "";
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}

	return globalThis.btoa(binary).replace(/\+/g, "~").replace(/\//g, "_").replace(/=/g, "");
}
