/**
 * Records the live composited view — base camera feed plus the turbulence-displaced
 * effect overlay — into a downloadable video. Because the effect's motion is a CSS/SVG
 * filter (not baked into pixels), we re-composite both layers into a dedicated canvas
 * each frame, applying the same filter via the 2D context, then capture that canvas's
 * stream. Optional mic audio (the user's spoken commands) is mixed in.
 */
export class LiveRecorder {
	private recorder: MediaRecorder | null = null
	private chunks: BlobPart[] = []
	private raf = 0
	private recordCanvas = document.createElement('canvas')

	get active(): boolean {
		return this.recorder !== null
	}

	start(base: HTMLCanvasElement, effect: HTMLCanvasElement, filterId: string, audio?: MediaStream | null): void {
		if (this.recorder) return

		const w = base.width || 1280
		const h = base.height || 720
		this.recordCanvas.width = w
		this.recordCanvas.height = h
		const ctx = this.recordCanvas.getContext('2d')
		if (!ctx) throw new Error('could not get a 2D context to record')

		const draw = () => {
			ctx.clearRect(0, 0, w, h)
			ctx.filter = 'none'
			if (base.width > 0) ctx.drawImage(base, 0, 0, w, h)
			if (effect.width > 0) {
				ctx.filter = `url(#${filterId})`
				ctx.drawImage(effect, 0, 0, w, h)
				ctx.filter = 'none'
			}
			this.raf = requestAnimationFrame(draw)
		}
		this.raf = requestAnimationFrame(draw)

		const stream = this.recordCanvas.captureStream(30)
		if (audio) {
			for (const track of audio.getAudioTracks()) stream.addTrack(track)
		}

		const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
			? 'video/webm;codecs=vp9'
			: 'video/webm'
		this.chunks = []
		this.recorder = new MediaRecorder(stream, { mimeType })
		this.recorder.ondataavailable = (e) => {
			if (e.data.size > 0) this.chunks.push(e.data)
		}
		this.recorder.start(200)
	}

	async stop(): Promise<Blob | null> {
		const recorder = this.recorder
		if (!recorder) return null

		const done = new Promise<Blob>((resolve) => {
			recorder.onstop = () => resolve(new Blob(this.chunks, { type: 'video/webm' }))
		})
		recorder.stop()
		cancelAnimationFrame(this.raf)
		this.recorder = null

		return done
	}
}
