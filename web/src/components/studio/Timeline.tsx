import { Copy, Pause, Play, Scissors, SkipBack, SkipForward, Trash2, ZoomIn, ZoomOut } from 'lucide-react'
import { useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import { FPS, formatTimecodeFrames, shotSpanSec, snapToFrame, timelineEndSec, type Shot } from './types'
import { colors, font, radius } from './theme'

interface TimelineProps {
	shots: Shot[]
	currentTimeSec: number
	playing: boolean
	activeShotId: string | null
	onSeek: (sec: number) => void
	onSelectShot: (shotId: string) => void
	onOpenInspector: (shotId: string) => void
	onPatchShot: (shotId: string, patch: Partial<Shot>) => void
	onTogglePlay: () => void
	onStepBack: () => void
	onStepForward: () => void
	onSplitShot: (shotId: string, atSec: number) => void
	onDuplicateShot: (shotId: string) => void
	onDeleteShot: (shotId: string) => void
}

const DEFAULT_PX_PER_SEC = 40
const MIN_PX_PER_SEC = 14
const MAX_PX_PER_SEC = 140
const MIN_SPAN = 1 / FPS

type DragMode = 'move' | 'trim-l' | 'trim-r'

function clamp(v: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, v))
}

export default function Timeline({
	shots,
	currentTimeSec,
	playing,
	activeShotId,
	onSeek,
	onSelectShot,
	onOpenInspector,
	onPatchShot,
	onTogglePlay,
	onStepBack,
	onStepForward,
	onSplitShot,
	onDuplicateShot,
	onDeleteShot,
}: TimelineProps) {
	const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC)
	const zoomIn = () => setPxPerSec((v) => Math.min(MAX_PX_PER_SEC, Math.round(v * 1.4)))
	const zoomOut = () => setPxPerSec((v) => Math.max(MIN_PX_PER_SEC, Math.round(v / 1.4)))

	const total = Math.max(timelineEndSec(shots), 30)
	const width = total * pxPerSec
	const tickEvery = [1, 5, 10, 30, 60].find((step) => step * pxPerSec >= 50) ?? 60

	const ticks: number[] = []
	for (let t = 0; t <= total; t += tickEvery) ticks.push(t)

	const activeShot = shots.find((s) => s.id === activeShotId) ?? null
	const canSplit =
		!!activeShot &&
		currentTimeSec > activeShot.startSec + 1 / FPS &&
		currentTimeSec < activeShot.startSec + shotSpanSec(activeShot) - 1 / FPS

	const handleRulerClick = (e: MouseEvent<HTMLDivElement>) => {
		const rect = e.currentTarget.getBoundingClientRect()
		const sec = (e.clientX - rect.left) / pxPerSec
		onSeek(clamp(snapToFrame(sec), 0, total))
	}

	const beginDrag = (e: PointerEvent<HTMLElement>, mode: DragMode, shot: Shot) => {
		if (mode !== 'move') e.stopPropagation()
		const el = e.currentTarget
		el.setPointerCapture(e.pointerId)
		const startX = e.clientX
		const orig = { startSec: shot.startSec, trimStartSec: shot.trimStartSec, trimEndSec: shot.trimEndSec }
		let moved = false

		const onMove = (ev: globalThis.PointerEvent) => {
			const dx = ev.clientX - startX
			if (Math.abs(dx) > 3) moved = true
			const dSec = dx / pxPerSec
			if (mode === 'move') {
				onPatchShot(shot.id, { startSec: Math.max(0, snapToFrame(orig.startSec + dSec)) })
			} else if (mode === 'trim-l') {
				const rightEdge = orig.startSec + (orig.trimEndSec - orig.trimStartSec)
				const newTrimStart = clamp(snapToFrame(orig.trimStartSec + dSec), 0, orig.trimEndSec - MIN_SPAN)
				onPatchShot(shot.id, {
					trimStartSec: newTrimStart,
					startSec: Math.max(0, rightEdge - (orig.trimEndSec - newTrimStart)),
				})
			} else {
				const newTrimEnd = clamp(snapToFrame(orig.trimEndSec + dSec), orig.trimStartSec + MIN_SPAN, shot.durationSec)
				onPatchShot(shot.id, { trimEndSec: newTrimEnd })
			}
		}

		const onUp = (ev: globalThis.PointerEvent) => {
			el.releasePointerCapture(ev.pointerId)
			el.removeEventListener('pointermove', onMove)
			el.removeEventListener('pointerup', onUp)
			if (!moved && mode === 'move') onSelectShot(shot.id)
		}

		el.addEventListener('pointermove', onMove)
		el.addEventListener('pointerup', onUp)
	}

	return (
		<div
			style={{
				borderTop: `1px solid ${colors.border}`,
				background: colors.surface1,
				flex: 'none',
				zIndex: 20,
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					padding: '8px 16px',
					gap: 16,
					borderBottom: `1px solid ${colors.border}`,
					background: colors.surface2,
				}}
			>
				<span style={{ fontFamily: font.mono, fontSize: 13, color: colors.text, minWidth: 132 }}>
					{formatTimecodeFrames(currentTimeSec)}
					<span style={{ color: colors.textFaint }}> / {formatTimecodeFrames(total)}</span>
				</span>

				<div style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 6 }}>
					<button onClick={onStepBack} title="Previous frame" style={transportButtonStyle}>
						<SkipBack size={14} fill="currentColor" />
					</button>
					<button
						onClick={onTogglePlay}
						style={{ ...transportButtonStyle, background: colors.surface4, border: `1px solid ${colors.border}` }}
					>
						{playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
					</button>
					<button onClick={onStepForward} title="Next frame" style={transportButtonStyle}>
						<SkipForward size={14} fill="currentColor" />
					</button>
				</div>

				<div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
					<div style={{ display: 'flex', gap: 4 }}>
						<button
							onClick={() => activeShot && onSplitShot(activeShot.id, currentTimeSec)}
							onMouseEnter={(e) => canSplit && (e.currentTarget.style.background = colors.surface4)}
							onMouseLeave={(e) => (e.currentTarget.style.background = colors.surface3)}
							disabled={!canSplit}
							title={activeShot ? 'Split clip at playhead' : 'Select a clip to split'}
							style={{ ...editToolButtonStyle, opacity: canSplit ? 1 : 0.35, cursor: canSplit ? 'pointer' : 'default' }}
						>
							<Scissors size={13} strokeWidth={1.8} />
						</button>
						<button
							onClick={() => activeShot && onDuplicateShot(activeShot.id)}
							onMouseEnter={(e) => activeShot && (e.currentTarget.style.background = colors.surface4)}
							onMouseLeave={(e) => (e.currentTarget.style.background = colors.surface3)}
							disabled={!activeShot}
							title={activeShot ? 'Duplicate clip' : 'Select a clip to duplicate'}
							style={{ ...editToolButtonStyle, opacity: activeShot ? 1 : 0.35, cursor: activeShot ? 'pointer' : 'default' }}
						>
							<Copy size={13} strokeWidth={1.8} />
						</button>
						<button
							onClick={() => activeShot && onDeleteShot(activeShot.id)}
							onMouseEnter={(e) => activeShot && (e.currentTarget.style.background = colors.surface4)}
							onMouseLeave={(e) => (e.currentTarget.style.background = colors.surface3)}
							disabled={!activeShot}
							title={activeShot ? 'Delete clip' : 'Select a clip to delete'}
							style={{
								...editToolButtonStyle,
								opacity: activeShot ? 1 : 0.35,
								cursor: activeShot ? 'pointer' : 'default',
								color: activeShot ? colors.critical : colors.textFaint,
							}}
						>
							<Trash2 size={13} strokeWidth={1.8} />
						</button>
					</div>

					<div style={{ width: 1, height: 18, background: colors.border }} />

					<div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
						<button
							onClick={zoomOut}
							disabled={pxPerSec <= MIN_PX_PER_SEC}
							onMouseEnter={(e) => (e.currentTarget.style.background = colors.surface4)}
							onMouseLeave={(e) => (e.currentTarget.style.background = colors.surface3)}
							title="Zoom out"
							style={{ ...editToolButtonStyle, opacity: pxPerSec <= MIN_PX_PER_SEC ? 0.35 : 1 }}
						>
							<ZoomOut size={13} strokeWidth={1.8} />
						</button>
						<span style={{ fontSize: 9.5, fontFamily: font.mono, color: colors.textFaint, minWidth: 30, textAlign: 'center' }}>
							{Math.round((pxPerSec / DEFAULT_PX_PER_SEC) * 100)}%
						</span>
						<button
							onClick={zoomIn}
							disabled={pxPerSec >= MAX_PX_PER_SEC}
							onMouseEnter={(e) => (e.currentTarget.style.background = colors.surface4)}
							onMouseLeave={(e) => (e.currentTarget.style.background = colors.surface3)}
							title="Zoom in"
							style={{ ...editToolButtonStyle, opacity: pxPerSec >= MAX_PX_PER_SEC ? 0.35 : 1 }}
						>
							<ZoomIn size={13} strokeWidth={1.8} />
						</button>
					</div>
				</div>
			</div>

			<div style={{ overflowX: 'auto' }}>
				<div style={{ width, position: 'relative' }}>
					<div
						onClick={handleRulerClick}
						style={{
							height: 22,
							position: 'relative',
							cursor: 'pointer',
							borderBottom: `1px solid ${colors.border}`,
							background: colors.surface0,
						}}
					>
						{ticks.map((t) => (
							<div
								key={t}
								style={{
									position: 'absolute',
									left: t * pxPerSec,
									top: 0,
									bottom: 0,
									width: 1,
									background: t % (tickEvery * 5) === 0 ? colors.borderStrong : colors.borderFaint,
								}}
							/>
						))}
					</div>

					<div style={{ position: 'relative', height: 64, padding: '6px 0', background: colors.surface0 }}>
						{shots.map((shot) => {
							const span = shotSpanSec(shot)
							const left = shot.startSec * pxPerSec
							const w = Math.max(span * pxPerSec, 8)
							const isActive = shot.id === activeShotId
							const isTrimmed = shot.trimStartSec > 0 || shot.trimEndSec < shot.durationSec

							return (
								<div
									key={shot.id}
									onPointerDown={(e) => beginDrag(e, 'move', shot)}
									onDoubleClick={() => onOpenInspector(shot.id)}
									onMouseEnter={(e) => {
										if (!isActive) e.currentTarget.style.borderColor = colors.borderStrong
									}}
									onMouseLeave={(e) => {
										if (!isActive) e.currentTarget.style.borderColor = colors.border
									}}
									title={`${shot.label} — drag to move, edges to trim, double-click to edit`}
									style={{
										position: 'absolute',
										left,
										top: 6,
										width: w,
										height: 52,
										border: `1px solid ${isActive ? colors.accent : colors.border}`,
										borderRadius: radius.md,
										background: shot.keyframeUrl
											? `${colors.surface2} url(${shot.keyframeUrl}) center/cover`
											: colors.surface2,
										boxShadow: isActive ? `0 0 0 1px ${colors.accent}` : 'none',
										cursor: 'grab',
										overflow: 'hidden',
										display: 'flex',
										alignItems: 'flex-end',
										padding: 4,
										touchAction: 'none',
										userSelect: 'none',
										transition: 'border-color 0.12s ease',
									}}
								>
									<div
										onPointerDown={(e) => beginDrag(e, 'trim-l', shot)}
										style={{ ...trimHandleStyle, left: 0, borderRadius: `${radius.md}px 0 0 ${radius.md}px` }}
									/>
									<div
										onPointerDown={(e) => beginDrag(e, 'trim-r', shot)}
										style={{ ...trimHandleStyle, right: 0, borderRadius: `0 ${radius.md}px ${radius.md}px 0` }}
									/>
									{isTrimmed && (
										<span
											style={{
												position: 'absolute',
												top: 4,
												right: 8,
												fontSize: 8.5,
												fontFamily: font.mono,
												color: colors.textDim,
												background: 'rgba(9,9,11,0.8)',
												padding: '1px 4px',
												borderRadius: radius.sm,
											}}
										>
											{span.toFixed(1)}s
										</span>
									)}
									<span
										style={{
											fontSize: 10,
											color: colors.text,
											background: 'rgba(9,9,11,0.78)',
											border: `1px solid ${colors.borderFaint}`,
											padding: '1px 4px',
											borderRadius: radius.sm,
											fontFamily: font.mono,
											position: 'relative',
											zIndex: 1,
										}}
									>
										{shot.label}
									</span>
								</div>
							)
						})}

						<div
							style={{
								position: 'absolute',
								left: currentTimeSec * pxPerSec,
								top: -22,
								bottom: 0,
								width: 1,
								background: colors.accent,
							}}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}

const editToolButtonStyle: CSSProperties = {
	width: 26,
	height: 26,
	display: 'grid',
	placeItems: 'center',
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm,
	background: colors.surface3,
	color: colors.textDim,
	transition: 'background-color 0.12s ease',
}

const transportButtonStyle: CSSProperties = {
	width: 28,
	height: 28,
	display: 'grid',
	placeItems: 'center',
	border: '1px solid transparent',
	borderRadius: radius.pill,
	background: 'transparent',
	color: colors.text,
	cursor: 'pointer',
}

const trimHandleStyle: CSSProperties = {
	position: 'absolute',
	top: 0,
	bottom: 0,
	width: 7,
	cursor: 'ew-resize',
	background: 'rgba(250,250,250,0.14)',
	zIndex: 2,
	touchAction: 'none',
}
