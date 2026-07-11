const DIFF_LOW = 24
const DIFF_HIGH = 100
const MAX_EDGE = 1600

export interface Size {
	width: number
	height: number
}

/** The canonical working resolution for a source image — its natural size, capped for perf. */
export function targetSize(img: HTMLImageElement): Size | null {
	if (!img.complete || img.naturalWidth === 0) return null
	const w = img.naturalWidth
	const h = img.naturalHeight
	const scale = Math.min(1, MAX_EDGE / Math.max(w, h))
	return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

function ensureSize(canvas: HTMLCanvasElement, size: Size): void {
	if (canvas.width !== size.width || canvas.height !== size.height) {
		canvas.width = size.width
		canvas.height = size.height
	}
}

/** Draw the live camera frame into the base canvas, resizing the canvas to the frame. */
export function drawLiveFrame(canvas: HTMLCanvasElement, liveFrame: HTMLImageElement): void {
	const size = targetSize(liveFrame)
	if (!size) return
	ensureSize(canvas, size)
	const ctx = canvas.getContext('2d')
	if (!ctx) return
	ctx.clearRect(0, 0, size.width, size.height)
	ctx.drawImage(liveFrame, 0, 0, size.width, size.height)
}

/**
 * Build a per-pixel diff mask: the effect image with alpha proportional to how much
 * each pixel changed from the live frame. Unchanged pixels become transparent, so the
 * live feed shows through and only the genuinely new content (clouds, fire, dimming)
 * is drawn. Writes the result into `out` and returns true on success.
 */
export function drawEffectMask(
	out: HTMLCanvasElement,
	before: HTMLImageElement,
	after: HTMLImageElement,
	scratch: HTMLCanvasElement,
): boolean {
	const size = targetSize(before) ?? targetSize(after)
	if (!size || !before.complete || before.naturalWidth === 0 || !after.complete || after.naturalWidth === 0)
		return false

	const { width, height } = size
	ensureSize(scratch, { width, height })
	const sctx = scratch.getContext('2d', { willReadFrequently: true })
	if (!sctx) return false

	sctx.drawImage(before, 0, 0, width, height)
	const beforeData = sctx.getImageData(0, 0, width, height)

	sctx.clearRect(0, 0, width, height)
	sctx.drawImage(after, 0, 0, width, height)
	const afterData = sctx.getImageData(0, 0, width, height)

	const pixels = afterData.data
	for (let i = 0; i < pixels.length; i += 4) {
		const diff =
			Math.abs(pixels[i] - beforeData.data[i]) +
			Math.abs(pixels[i + 1] - beforeData.data[i + 1]) +
			Math.abs(pixels[i + 2] - beforeData.data[i + 2])
		pixels[i + 3] = Math.max(0, Math.min(255, ((diff - DIFF_LOW) / (DIFF_HIGH - DIFF_LOW)) * 255))
	}

	ensureSize(out, { width, height })
	const octx = out.getContext('2d')
	if (!octx) return false
	octx.putImageData(afterData, 0, 0)
	return true
}

export function clearCanvas(canvas: HTMLCanvasElement): void {
	const ctx = canvas.getContext('2d')
	if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
}
