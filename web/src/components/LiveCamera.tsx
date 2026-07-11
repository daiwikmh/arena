import { useCallback, useEffect, useRef, useState } from 'react'
import { Camera, Copy, Mic, MicOff, Send, Sparkles, Video, VideoOff } from 'lucide-react'
import { colors, font, radius, shadow } from './studio/theme'
import { baseUrl, liveSessionWebSocketUrl } from '../lib/api'

type Role = 'camera' | 'control'

interface LiveCameraProps {
	projectId: string
}

interface TranscriptEntry {
	id: string
	role: 'user' | 'model'
	text: string
}

interface EffectEntry {
	id: string
	description: string
	frameUrl: string
	costUsd: number
}

function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
	if (fromRate === toRate) return input
	const ratio = fromRate / toRate
	const outLength = Math.floor(input.length / ratio)
	const out = new Float32Array(outLength)
	for (let i = 0; i < outLength; i++) {
		out[i] = input[Math.floor(i * ratio)]
	}
	return out
}

function floatToPcm16Base64(input: Float32Array): string {
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

export default function LiveCamera({ projectId }: LiveCameraProps) {
	const [role, setRole] = useState<Role>('control')
	const [connected, setConnected] = useState(false)
	const [micOn, setMicOn] = useState(false)
	const [cameraOn, setCameraOn] = useState(false)
	const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
	const [effects, setEffects] = useState<EffectEntry[]>([])
	const [textInput, setTextInput] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [copied, setCopied] = useState(false)

	const wsRef = useRef<WebSocket | null>(null)
	const videoRef = useRef<HTMLVideoElement>(null)
	const captureCanvasRef = useRef<HTMLCanvasElement>(null)
	const displayCanvasRef = useRef<HTMLCanvasElement>(null)
	const liveFrameImgRef = useRef<HTMLImageElement>(new Image())
	const effectImgRef = useRef<HTMLImageElement>(new Image())
	const audioCtxRef = useRef<AudioContext | null>(null)
	const audioStreamRef = useRef<MediaStream | null>(null)

	useEffect(() => {
		const params = new URLSearchParams(window.location.search)
		const r = params.get('role')
		if (r === 'camera' || r === 'control') setRole(r)
	}, [])

	const cameraShareUrl =
		typeof window !== 'undefined' ? `${window.location.origin}/live/${projectId}?role=camera` : ''

	const drawDisplay = useCallback(() => {
		const canvas = displayCanvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return
		ctx.clearRect(0, 0, canvas.width, canvas.height)
		if (liveFrameImgRef.current.complete && liveFrameImgRef.current.naturalWidth > 0) {
			ctx.globalCompositeOperation = 'source-over'
			ctx.globalAlpha = 1
			ctx.drawImage(liveFrameImgRef.current, 0, 0, canvas.width, canvas.height)
		}
		if (effectImgRef.current.complete && effectImgRef.current.naturalWidth > 0) {
			ctx.globalCompositeOperation = 'lighten'
			ctx.globalAlpha = 0.92
			ctx.drawImage(effectImgRef.current, 0, 0, canvas.width, canvas.height)
			ctx.globalCompositeOperation = 'source-over'
			ctx.globalAlpha = 1
		}
	}, [])

	useEffect(() => {
		const ws = new WebSocket(liveSessionWebSocketUrl(projectId, role))
		ws.binaryType = 'arraybuffer'
		wsRef.current = ws

		ws.onopen = () => setConnected(true)
		ws.onclose = () => setConnected(false)
		ws.onerror = () => setError('Connection to the live backend dropped.')

		ws.onmessage = (event) => {
			if (typeof event.data !== 'string') return
			const msg = JSON.parse(event.data)

			if (msg.type === 'camera_frame') {
				liveFrameImgRef.current.src = `data:image/jpeg;base64,${msg.data}`
				liveFrameImgRef.current.onload = drawDisplay
			} else if (msg.type === 'effect_applied') {
				effectImgRef.current.src = `${baseUrl()}${msg.frame_url}`
				effectImgRef.current.onload = drawDisplay
				setEffects((prev) => [
					...prev,
					{ id: `${Date.now()}`, description: msg.description, frameUrl: msg.frame_url, costUsd: msg.cost_usd },
				])
			} else if (msg.type === 'transcript') {
				setTranscript((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, role: msg.role, text: msg.text }])
			} else if (msg.type === 'error') {
				setError(msg.message)
			}
		}

		return () => {
			ws.close()
			wsRef.current = null
		}
	}, [projectId, role, drawDisplay])

	const startCamera = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { facingMode: { ideal: 'environment' } },
			})
			if (videoRef.current) {
				videoRef.current.srcObject = stream
				await videoRef.current.play()
			}
			setCameraOn(true)

			const canvas = captureCanvasRef.current
			if (!canvas) return
			const ctx = canvas.getContext('2d')
			if (!ctx) return

			const tick = () => {
				const video = videoRef.current
				const ws = wsRef.current
				if (video && video.videoWidth > 0 && ws && ws.readyState === WebSocket.OPEN) {
					canvas.width = video.videoWidth
					canvas.height = video.videoHeight
					ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
					canvas.toBlob(
						(blob) => {
							if (blob) blob.arrayBuffer().then((buf) => ws.send(buf))
						},
						'image/jpeg',
						0.8,
					)
				}
			}
			const interval = setInterval(tick, 1000)
			return () => clearInterval(interval)
		} catch (err) {
			setError(err instanceof Error ? `Camera access failed: ${err.message}` : 'Camera access failed.')
		}
	}, [])

	const startMic = useCallback(async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
			audioStreamRef.current = stream
			const audioCtx = new AudioContext()
			audioCtxRef.current = audioCtx
			const source = audioCtx.createMediaStreamSource(stream)
			const processor = audioCtx.createScriptProcessor(4096, 1, 1)
			const silence = audioCtx.createGain()
			silence.gain.value = 0

			processor.onaudioprocess = (e) => {
				const ws = wsRef.current
				if (!ws || ws.readyState !== WebSocket.OPEN) return
				const input = e.inputBuffer.getChannelData(0)
				const resampled = resample(input, audioCtx.sampleRate, 16000)
				const b64 = floatToPcm16Base64(resampled)
				ws.send(JSON.stringify({ type: 'audio', data: b64 }))
			}

			source.connect(processor)
			processor.connect(silence)
			silence.connect(audioCtx.destination)
			setMicOn(true)
		} catch (err) {
			setError(err instanceof Error ? `Microphone access failed: ${err.message}` : 'Microphone access failed.')
		}
	}, [])

	const stopMic = useCallback(() => {
		audioStreamRef.current?.getTracks().forEach((t) => t.stop())
		audioCtxRef.current?.close()
		audioStreamRef.current = null
		audioCtxRef.current = null
		setMicOn(false)
		wsRef.current?.send(JSON.stringify({ type: 'audio_end' }))
	}, [])

	const sendText = useCallback(() => {
		const text = textInput.trim()
		if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
		wsRef.current.send(JSON.stringify({ type: 'text', text }))
		setTranscript((prev) => [...prev, { id: `${Date.now()}`, role: 'user', text }])
		setTextInput('')
	}, [textInput])

	const copyShareUrl = useCallback(() => {
		navigator.clipboard.writeText(cameraShareUrl)
		setCopied(true)
		setTimeout(() => setCopied(false), 1800)
	}, [cameraShareUrl])

	return (
		<div
			style={{
				position: 'fixed',
				inset: 0,
				background: colors.surface0,
				color: colors.text,
				fontFamily: font.sans,
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: '10px 16px',
					borderBottom: `1px solid ${colors.border}`,
					background: colors.surface1,
				}}
			>
				<Sparkles size={16} color={colors.accent} />
				<span style={{ fontSize: 13, fontWeight: 700 }}>Arena Live</span>
				<span
					style={{
						fontFamily: font.mono,
						fontSize: 10.5,
						color: colors.textFaint,
						textTransform: 'uppercase',
						letterSpacing: '0.06em',
					}}
				>
					{role}
				</span>
				<span style={{ flex: 1 }} />
				<span
					style={{
						width: 7,
						height: 7,
						borderRadius: radius.pill,
						background: connected ? colors.clear : colors.critical,
					}}
				/>
				<span style={{ fontSize: 11, color: colors.textFaint }}>{connected ? 'connected' : 'connecting…'}</span>
			</div>

			{error && (
				<div
					style={{
						padding: '8px 16px',
						background: colors.accentDim,
						borderBottom: `1px solid ${colors.border}`,
						color: colors.critical,
						fontSize: 12,
					}}
				>
					{error}
				</div>
			)}

			{role === 'camera' ? (
				<div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 16 }}>
					<div
						style={{
							width: '100%',
							maxWidth: 480,
							aspectRatio: '3 / 4',
							borderRadius: radius.lg,
							overflow: 'hidden',
							border: `1px solid ${colors.borderStrong}`,
							background: colors.black,
							boxShadow: shadow.elevated,
							position: 'relative',
						}}
					>
						<video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
						{!cameraOn && (
							<div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
								<Camera size={40} color={colors.textFaint} />
							</div>
						)}
					</div>
					<canvas ref={captureCanvasRef} style={{ display: 'none' }} />
					{!cameraOn ? (
						<button onClick={startCamera} style={primaryButtonStyle}>
							<Video size={15} style={{ marginRight: 6 }} />
							Start camera
						</button>
					) : (
						<span style={{ fontSize: 12, color: colors.textFaint }}>Streaming to the live session — point at anything.</span>
					)}
				</div>
			) : (
				<div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
					<div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 16, gap: 12, overflowY: 'auto' }}>
						<div
							style={{
								width: '100%',
								aspectRatio: '4 / 3',
								borderRadius: radius.lg,
								overflow: 'hidden',
								border: `1px solid ${colors.borderStrong}`,
								background: colors.black,
								boxShadow: shadow.elevated,
								position: 'relative',
							}}
						>
							<canvas ref={displayCanvasRef} width={960} height={720} style={{ width: '100%', height: '100%' }} />
							{effects.length === 0 && (
								<div
									style={{
										position: 'absolute',
										inset: 0,
										display: 'grid',
										placeItems: 'center',
										color: colors.textFaint,
										fontSize: 12,
										textAlign: 'center',
										padding: 20,
									}}
								>
									Waiting for the camera device to join and start streaming…
								</div>
							)}
						</div>

						<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
							<button
								onClick={micOn ? stopMic : startMic}
								style={{
									...roundIconStyle,
									background: micOn ? colors.critical : colors.surface3,
									color: micOn ? colors.white : colors.textDim,
								}}
								title={micOn ? 'Stop listening' : 'Start listening'}
							>
								{micOn ? <MicOff size={16} /> : <Mic size={16} />}
							</button>
							<input
								value={textInput}
								onChange={(e) => setTextInput(e.target.value)}
								onKeyDown={(e) => e.key === 'Enter' && sendText()}
								placeholder="Or type it: give me a fireball…"
								style={textInputStyle}
							/>
							<button onClick={sendText} style={{ ...roundIconStyle, background: colors.white, color: colors.black }}>
								<Send size={15} />
							</button>
						</div>

						<div
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 8,
								padding: '8px 10px',
								borderRadius: radius.md,
								border: `1px solid ${colors.border}`,
								background: colors.surface1,
								fontSize: 11,
								color: colors.textFaint,
							}}
						>
							<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
								Camera device: {cameraShareUrl}
							</span>
							<button onClick={copyShareUrl} style={{ ...roundIconStyle, width: 26, height: 26, background: colors.surface3, color: colors.textDim }}>
								<Copy size={12} />
							</button>
							{copied && <span style={{ color: colors.clear }}>copied</span>}
						</div>
					</div>

					<div
						style={{
							width: 300,
							flex: 'none',
							borderLeft: `1px solid ${colors.border}`,
							background: colors.surface1,
							display: 'flex',
							flexDirection: 'column',
							overflow: 'hidden',
						}}
					>
						<div style={{ padding: '10px 14px', borderBottom: `1px solid ${colors.border}`, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em', color: colors.textFaint, fontFamily: font.mono }}>
							conversation
						</div>
						<div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
							{transcript.map((t) => (
								<div
									key={t.id}
									style={{
										alignSelf: t.role === 'user' ? 'flex-end' : 'flex-start',
										maxWidth: '92%',
										padding: '6px 10px',
										borderRadius: radius.md,
										background: t.role === 'user' ? colors.surface3 : colors.surface2,
										border: `1px solid ${colors.border}`,
										fontSize: 12,
										color: t.role === 'model' ? colors.text : colors.textDim,
									}}
								>
									{t.text}
								</div>
							))}
							{effects.map((e) => (
								<div
									key={e.id}
									style={{
										padding: '6px 10px',
										borderRadius: radius.md,
										border: `1px solid ${colors.accent}`,
										background: colors.accentDim,
										fontSize: 11,
										color: colors.accent,
									}}
								>
									applied: {e.description} (${e.costUsd.toFixed(4)})
								</div>
							))}
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

const primaryButtonStyle = {
	display: 'flex',
	alignItems: 'center',
	padding: '10px 18px',
	borderRadius: radius.md,
	background: colors.white,
	color: colors.black,
	border: 0,
	fontSize: 13,
	fontWeight: 700,
	cursor: 'pointer',
}

const roundIconStyle = {
	width: 36,
	height: 36,
	flex: 'none' as const,
	display: 'grid',
	placeItems: 'center' as const,
	borderRadius: radius.pill,
	border: 0,
	cursor: 'pointer' as const,
}

const textInputStyle = {
	flex: 1,
	height: 36,
	borderRadius: radius.md,
	border: `1px solid ${colors.border}`,
	background: colors.surface2,
	color: colors.text,
	fontSize: 12.5,
	padding: '0 12px',
	outline: 'none' as const,
}
