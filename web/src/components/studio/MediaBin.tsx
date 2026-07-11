import { ChevronsLeft, ChevronsRight, Plus, Upload } from 'lucide-react'
import { useRef, type ChangeEvent, type CSSProperties } from 'react'
import type { Shot } from './types'
import { colors, font, radius, shadow } from './theme'

interface MediaBinProps {
	shots: Shot[]
	activeShotId: string | null
	collapsed: boolean
	onToggleCollapse: () => void
	onSelect: (shotId: string) => void
	onOpenInspector: (shotId: string) => void
	onAddShot: () => void
	onUpload: (file: File) => void
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

const STATUS_COLOR: Record<Shot['status'], string> = {
	empty: colors.textFaint,
	generating_keyframe: colors.accent,
	keyframe_ready: colors.clear,
	generating_clip: colors.accent,
	clip_ready: colors.clear,
	editing: colors.warning,
	error: colors.critical,
}

export default function MediaBin({
	shots,
	activeShotId,
	collapsed,
	onToggleCollapse,
	onSelect,
	onOpenInspector,
	onAddShot,
	onUpload,
}: MediaBinProps) {
	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) onUpload(file)
		e.target.value = ''
	}

	if (collapsed) {
		return (
			<div
				style={{
					width: 40,
					flex: 'none',
					background: colors.surface1,
					borderRight: `1px solid ${colors.border}`,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					paddingTop: 10,
				}}
			>
				<button
					onClick={onToggleCollapse}
					title="Expand media bin"
					style={{
						width: 28,
						height: 28,
						display: 'grid',
						placeItems: 'center',
						border: `1px solid ${colors.border}`,
						borderRadius: radius.sm,
						background: colors.surface2,
						color: colors.textDim,
						cursor: 'pointer',
					}}
				>
					<ChevronsRight size={14} strokeWidth={1.6} />
				</button>
			</div>
		)
	}

	return (
		<div
			style={{
				width: 264,
				flex: 'none',
				background: colors.surface1,
				borderRight: `1px solid ${colors.border}`,
				display: 'flex',
				flexDirection: 'column',
				overflow: 'hidden',
			}}
		>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					padding: '10px 10px 10px 12px',
					borderBottom: `1px solid ${colors.border}`,
					background: colors.surface2,
				}}
			>
				<span
					style={{
						fontSize: 10.5,
						letterSpacing: '0.1em',
						textTransform: 'uppercase',
						color: colors.textFaint,
						fontFamily: font.mono,
					}}
				>
					Media
				</span>
				<span style={{ flex: 1 }} />
				<input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={handleFileChange} />
				<button
					onClick={() => fileInputRef.current?.click()}
					title="Upload reference image or video"
					style={iconButtonStyle}
				>
					<Upload size={13} strokeWidth={1.6} />
				</button>
				<button onClick={onToggleCollapse} title="Collapse media bin" style={iconButtonStyle}>
					<ChevronsLeft size={13} strokeWidth={1.6} />
				</button>
			</div>

			<div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, overflowY: 'auto' }}>
				{shots.map((shot) => {
					const thumb = shot.keyframeUrl ?? shot.clipUrl
					const isActive = shot.id === activeShotId
					return (
						<button
							key={shot.id}
							onClick={() => {
								onSelect(shot.id)
								onOpenInspector(shot.id)
							}}
							style={{
								padding: 0,
								border: `1px solid ${isActive ? colors.accent : colors.border}`,
								borderRadius: radius.md,
								background: colors.surface2,
								boxShadow: isActive ? `0 0 0 1px ${colors.accent}, ${shadow.card}` : shadow.card,
								overflow: 'hidden',
								cursor: 'pointer',
								textAlign: 'left',
								transition: 'border-color .12s, box-shadow .12s',
							}}
						>
							<div
								style={{
									aspectRatio: '16 / 9',
									background: colors.surface0,
									display: 'grid',
									placeItems: 'center',
									position: 'relative',
								}}
							>
								{thumb ? (
									<img
										src={thumb}
										alt={shot.label}
										style={{ width: '100%', height: '100%', objectFit: 'cover' }}
									/>
								) : (
									<span style={{ fontSize: 10, color: colors.borderStrong }}>+</span>
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
											background: 'rgba(10,11,13,0.88)',
											border: `1px solid ${colors.borderFaint}`,
											color: STATUS_COLOR[shot.status],
											padding: '2px 5px',
											borderRadius: radius.sm,
											fontFamily: font.mono,
										}}
									>
										{STATUS_LABEL[shot.status]}
									</span>
								)}
							</div>
							<div style={{ padding: '5px 7px', fontSize: 11, color: colors.textDim }}>{shot.label}</div>
						</button>
					)
				})}

				<button
					onClick={onAddShot}
					style={{
						aspectRatio: '16 / 9',
						border: `1px dashed ${colors.borderStrong}`,
						borderRadius: radius.md,
						background: 'transparent',
						color: colors.textFaint,
						display: 'grid',
						placeItems: 'center',
						cursor: 'pointer',
						alignSelf: 'start',
					}}
				>
					<Plus size={16} strokeWidth={1.6} />
				</button>
			</div>
		</div>
	)
}

const iconButtonStyle: CSSProperties = {
	width: 24,
	height: 24,
	display: 'grid',
	placeItems: 'center',
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm,
	background: colors.surface3,
	color: colors.textDim,
	cursor: 'pointer',
	flex: 'none',
}
