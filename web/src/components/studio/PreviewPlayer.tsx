import { Loader2 } from 'lucide-react'
import { filtersToCss, type Shot } from './types'
import { colors, font, radius } from './theme'

interface PreviewPlayerProps {
	shot: Shot | null
	onGenerateKeyframe: () => void
}

const STATUS_BADGE: Partial<Record<Shot['status'], string>> = {
	generating_keyframe: 'Generating keyframe — Nano Banana 2 Lite',
	generating_clip: 'Animating — Omni Flash',
	error: 'Generation failed',
}

export default function PreviewPlayer({ shot, onGenerateKeyframe }: PreviewPlayerProps) {
	const videoSrc = shot?.clipUrl ?? null
	const stillSrc = !videoSrc ? shot?.keyframeUrl ?? null : null
	const filter = shot ? filtersToCss(shot.filters) : undefined
	const busy = shot?.status === 'generating_keyframe' || shot?.status === 'generating_clip'
	const badge = shot ? STATUS_BADGE[shot.status] : undefined

	return (
		<div
			style={{
				flex: 1,
				margin: 16,
				borderRadius: radius.lg,
				background: colors.black,
				border: `1px solid ${colors.borderStrong}`,
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				position: 'relative',
				overflow: 'hidden',
			}}
		>
			{videoSrc ? (
				<video
					key={videoSrc}
					src={videoSrc}
					controls
					style={{ width: '100%', height: '100%', objectFit: 'contain', filter }}
				/>
			) : stillSrc ? (
				<img
					key={stillSrc}
					src={stillSrc}
					alt={shot?.label}
					style={{ width: '100%', height: '100%', objectFit: 'contain', filter }}
				/>
			) : (
				<button
					onClick={onGenerateKeyframe}
					style={{
						background: 'transparent',
						border: 0,
						cursor: shot ? 'pointer' : 'default',
						display: 'flex',
						flexDirection: 'column',
						alignItems: 'center',
						gap: 14,
						color: colors.textFaint,
					}}
				>
					<Crosshair />
					<span style={{ fontSize: 13, fontFamily: font.sans }}>
						{shot ? 'Ready when you are' : 'Select or add a shot'}
					</span>
				</button>
			)}

			{shot && (shot.aspectRatio || shot.label) && (
				<div
					style={{
						position: 'absolute',
						top: 10,
						left: 10,
						fontSize: 10,
						fontFamily: font.mono,
						color: colors.textDim,
						background: 'rgba(8,8,10,0.72)',
						border: `1px solid ${colors.borderFaint}`,
						borderRadius: radius.sm,
						padding: '3px 7px',
						letterSpacing: '0.03em',
					}}
				>
					{shot.label} · {shot.aspectRatio}
				</div>
			)}

			{badge && (
				<div
					style={{
						position: 'absolute',
						bottom: 10,
						left: '50%',
						transform: 'translateX(-50%)',
						display: 'flex',
						alignItems: 'center',
						gap: 6,
						fontSize: 11,
						fontFamily: font.mono,
						color: shot?.status === 'error' ? colors.critical : colors.textDim,
						background: 'rgba(8,8,10,0.82)',
						border: `1px solid ${colors.borderStrong}`,
						borderRadius: radius.pill,
						padding: '4px 10px',
					}}
				>
					{busy && <Loader2 size={11} className="animate-spin" />}
					{badge}
				</div>
			)}
		</div>
	)
}

function Crosshair() {
	const size = 64
	const bracket = 14
	return (
		<svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke={colors.borderStrong} strokeWidth={1.4}>
			<path d={`M2 ${bracket} V2 H${bracket}`} />
			<path d={`M${64 - bracket} 2 H62 V${bracket}`} />
			<path d={`M62 ${64 - bracket} V62 H${64 - bracket}`} />
			<path d={`M${bracket} 62 H2 V${64 - bracket}`} />
			<path d="M32 26 V38 M26 32 H38" />
		</svg>
	)
}
