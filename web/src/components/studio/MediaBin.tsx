import { Plus } from 'lucide-react'
import type { Shot } from './types'

interface MediaBinProps {
	shots: Shot[]
	activeShotId: string | null
	onSelect: (shotId: string) => void
	onAddShot: () => void
}

const STATUS_LABEL: Record<Shot['status'], string> = {
	empty: 'not started',
	generating_keyframe: 'generating…',
	keyframe_ready: 'keyframe ready',
	generating_clip: 'animating…',
	clip_ready: 'clip ready',
	editing: 'editing…',
	error: 'failed',
}

export default function MediaBin({ shots, activeShotId, onSelect, onAddShot }: MediaBinProps) {
	return (
		<div style={{ padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
			{shots.map((shot) => {
				const thumb = shot.keyframeUrl ?? shot.clipUrl
				const isActive = shot.id === activeShotId
				return (
					<button
						key={shot.id}
						onClick={() => onSelect(shot.id)}
						style={{
							padding: 0,
							border: `1px solid ${isActive ? '#34BEDC' : '#2C3238'}`,
							borderRadius: 4,
							background: '#1F242A',
							overflow: 'hidden',
							cursor: 'pointer',
							textAlign: 'left',
						}}
					>
						<div
							style={{
								aspectRatio: '16 / 9',
								background: '#0B0D10',
								display: 'grid',
								placeItems: 'center',
								position: 'relative',
							}}
						>
							{thumb ? (
								<img src={thumb} alt={shot.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
							) : (
								<span style={{ fontSize: 10, color: '#3D444C' }}>+</span>
							)}
							{shot.status !== 'empty' && (
								<span
									style={{
										position: 'absolute',
										right: 4,
										bottom: 4,
										fontSize: 8.5,
										letterSpacing: '0.03em',
										textTransform: 'uppercase',
										background: 'rgba(11,13,16,0.85)',
										color: shot.status === 'error' ? '#E4635E' : '#9AA1A9',
										padding: '2px 5px',
										borderRadius: 2,
									}}
								>
									{STATUS_LABEL[shot.status]}
								</span>
							)}
						</div>
						<div style={{ padding: '5px 7px', fontSize: 11, color: '#9AA1A9' }}>{shot.label}</div>
					</button>
				)
			})}

			<button
				onClick={onAddShot}
				style={{
					aspectRatio: '16 / 9',
					border: '1px dashed #3D444C',
					borderRadius: 4,
					background: 'transparent',
					color: '#6B727A',
					display: 'grid',
					placeItems: 'center',
					cursor: 'pointer',
					alignSelf: 'start',
				}}
			>
				<Plus size={16} strokeWidth={1.6} />
			</button>
		</div>
	)
}
