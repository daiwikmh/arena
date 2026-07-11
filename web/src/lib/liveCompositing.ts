const DIFF_LOW = 24
const DIFF_HIGH = 100

export function buildEffectMask(
	before: HTMLImageElement,
	after: HTMLImageElement,
	scratch: HTMLCanvasElement,
	width: number,
	height: number,
): boolean {
	if (!before.complete || before.naturalWidth === 0 || !after.complete || after.naturalWidth === 0) return false

	scratch.width = width
	scratch.height = height
	const ctx = scratch.getContext('2d')
	if (!ctx) return false

	ctx.drawImage(before, 0, 0, width, height)
	const beforeData = ctx.getImageData(0, 0, width, height)

	ctx.clearRect(0, 0, width, height)
	ctx.drawImage(after, 0, 0, width, height)
	const afterData = ctx.getImageData(0, 0, width, height)

	const pixels = afterData.data
	for (let i = 0; i < pixels.length; i += 4) {
		const diff =
			Math.abs(pixels[i] - beforeData.data[i]) +
			Math.abs(pixels[i + 1] - beforeData.data[i + 1]) +
			Math.abs(pixels[i + 2] - beforeData.data[i + 2])
		pixels[i + 3] = Math.max(0, Math.min(255, ((diff - DIFF_LOW) / (DIFF_HIGH - DIFF_LOW)) * 255))
	}

	ctx.putImageData(afterData, 0, 0)
	return true
}

export function drawLiveDisplay(
	canvas: HTMLCanvasElement,
	liveFrame: HTMLImageElement,
	maskCanvas: HTMLCanvasElement,
	hasMask: boolean,
): void {
	const ctx = canvas.getContext('2d')
	if (!ctx) return
	ctx.clearRect(0, 0, canvas.width, canvas.height)
	if (liveFrame.complete && liveFrame.naturalWidth > 0) {
		ctx.globalCompositeOperation = 'source-over'
		ctx.globalAlpha = 1
		ctx.drawImage(liveFrame, 0, 0, canvas.width, canvas.height)
	}
	if (hasMask) {
		ctx.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height)
	}
}
