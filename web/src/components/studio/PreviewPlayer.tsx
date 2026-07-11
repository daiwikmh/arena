import type { Shot } from './types'

interface PreviewPlayerProps {
	shot: Shot | null
	onGenerateKeyframe: () => void
}

export default function PreviewPlayer({ shot, onGenerateKeyframe }: PreviewPlayerProps) {
	const videoSrc = shot?.clipUrl ?? null
	const stillSrc = !videoSrc ? shot?.keyframeUrl ?? null : null

	return (
		<div
			style={{
				flex: 1,
				margin: 16,
				borderRadius: 6,
				background: 'linear-gradient(180deg, #171B1F, #0F1215)',
				border: '1px solid #2C3238',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				position: 'relative',
				overflow: 'hidden',
			}}
		>
			{videoSrc ? (
				<video src={videoSrc} controls style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
			) : stillSrc ? (
				<img src={stillSrc} alt={shot?.label} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
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
						color: '#6B727A',
					}}
				>
					<Crosshair />
					<span style={{ fontSize: 13 }}>{shot ? 'Ready when you are' : 'Select or add a shot'}</span>
				</button>
			)}
		</div>
	)
}

function Crosshair() {
	const size = 64
	const bracket = 14
	return (
		<svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="#3D444C" strokeWidth={1.4}>
			<path d={`M2 ${bracket} V2 H${bracket}`} />
			<path d={`M${64 - bracket} 2 H62 V${bracket}`} />
			<path d={`M62 ${64 - bracket} V62 H${64 - bracket}`} />
			<path d={`M${bracket} 62 H2 V${64 - bracket}`} />
			<path d="M32 26 V38 M26 32 H38" />
		</svg>
	)
}
