export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
	if (fromRate === toRate) return input
	const ratio = fromRate / toRate
	const outLength = Math.floor(input.length / ratio)
	const out = new Float32Array(outLength)
	for (let i = 0; i < outLength; i++) {
		out[i] = input[Math.floor(i * ratio)]
	}
	return out
}

export function floatToPcm16Base64(input: Float32Array): string {
	const pcm = new Int16Array(input.length)
	for (let i = 0; i < input.length; i++) {
		const s = Math.max(-1, Math.min(1, input[i]))
		pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
	}
	const bytes = new Uint8Array(pcm.buffer)
	let binary = ''
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
	return btoa(binary)
}
