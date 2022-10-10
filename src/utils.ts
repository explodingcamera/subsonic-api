export function arrayBufferToBase64(bytes: Uint8Array) {
	if (typeof window === 'undefined') {
		return Buffer.from(bytes).toString('base64url');
	}

	let binary = '';
	const len = bytes.byteLength;
	for (let i = 0; i < len; i++) {
		binary += String.fromCharCode(bytes[i]);
	}

	return globalThis
		.btoa(binary)
		.replace(/\+/g, '~')
		.replace(/\//g, '_')
		.replace(/=/g, '');
}
