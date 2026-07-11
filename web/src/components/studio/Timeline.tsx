import { Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { CSSProperties, MouseEvent } from 'react'
import { formatTimecode, totalDurationSec, type Shot } from './types'

interface TimelineProps {
	shots: Shot[]
	currentTimeSec: number
	playing: boolean
	activeShotId: string | null
	onSeek: (sec: number) => void
	onSelectShot: (shotId: string) => void
	onTogglePlay: () => void
	onStepBack: () => void
	onStepForward: () => void
}

const PX_PER_SEC = 40
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'

export default function Timeline({
	shots,
	currentTimeSec,
	playing,
	activeShotId,
	onSeek,
	onSelectShot,
	onTogglePlay,
	onStepBack,
	onStepForward,
}: TimelineProps) {
	const total = Math.max(totalDurationSec(shots), 30)
	const width = total * PX_PER_SEC
	const tickEvery = total > 90 ? 5 : 1

	const ticks: number[] = []
	for (let t = 0; t <= total; t += tickEvery) ticks.push(t)

	const handleRulerClick = (e: MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect()
		const sec = (e.clientX - rect.left) / PX_PER_SEC
		onSeek(Math.max(0, Math.min(total, sec)))
	}

	let shotOffset = 0

	return (
		<div style={{ borderTop: '1px solid #2C3238', background: '#14171A', flex: 'none' }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					padding: '8px 16px',
					gap: 16,
					borderBottom: '1px solid #1F242A',
				}}
			>
				<span style={{ fontFamily: MONO, fontSize: 13, color: '#E6E9EC', minWidth: 90 }}>
					{formatTimecode(currentTimeSec)}
					<span style={{ color: '#6B727A' }}>/{formatTimecode(total)}</span>
				</span>

				<div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 6 }}>
					<button onClick={onStepBack} style={transportButtonStyle}>
						<SkipBack size={14} fill="currentColor" />
					</button>
					<button onClick={onTogglePlay} style={transportButtonStyle}>
						{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
					</button>
					<button onClick={onStepForward} style={transportButtonStyle}>
						<SkipForward size={14} fill="currentColor" />
					</button>
				</div>

				<span style={{ minWidth: 90 }} />
			</div>

			<div style={{ overflowX: 'auto' }}>
				<div style={{ width, position: 'relative' }}>
					<div
						onClick={handleRulerClick}
						style={{ height: 22, position: 'relative', cursor: 'pointer', borderBottom: '1px solid #1F242A' }}
					>
						{ticks.map((t) => (
							<div
								key={t}
								style={{
									position: 'absolute',
									left: t * PX_PER_SEC,
									top: 0,
									bottom: 0,
									width: 1,
									background: t % (tickEvery * 5) === 0 ? '#3D444C' : '#22272C',
								}}
							/>
						))}
					</div>

					<div style={{ position: 'relative', height: 64, padding: '6px 0' }}>
						{shots.map((shot) => {
							const left = shotOffset * PX_PER_SEC
							shotOffset += shot.durationSec
							const w = shot.durationSec * PX_PER_SEC
							const isActive = shot.id === activeShotId
							return (
								<button
									key={shot.id}
									onClick={() => onSelectShot(shot.id)}
									style={{
										position: 'absolute',
										left,
										top: 6,
										width: w - 2,
										height: 52,
										border: `1px solid ${isActive ? '#34BEDC' : '#2C3238'}`,
										borderRadius: 3,
										background: shot.keyframeUrl
											? `url(${shot.keyframeUrl}) center/cover`
											: '#1F242A',
										cursor: 'pointer',
										overflow: 'hidden',
										display: 'flex',
										alignItems: 'flex-end',
										padding: 4,
									}}
								>
									<span
										style={{
											fontSize: 10,
											color: '#E6E9EC',
											background: 'rgba(11,13,16,0.7)',
											padding: '1px 4px',
											borderRadius: 2,
											fontFamily: MONO,
										}}
									>
										{shot.label}
									</span>
								</button>
							)
						})}

						<div
							style={{
								position: 'absolute',
								left: currentTimeSec * PX_PER_SEC,
								top: -22,
								bottom: 0,
								width: 1,
								background: '#34BEDC',
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}

const transportButtonStyle: CSSProperties = {
	width: 28,
	height: 28,
	display: 'grid',
	placeItems: 'center',
	border: 0,
	borderRadius: '50%',
	background: 'transparent',
	color: '#E6E9EC',
	cursor: 'pointer',
}
