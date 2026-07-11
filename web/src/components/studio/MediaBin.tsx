import { ChevronsLeft, ChevronsRight, Plus, Upload } from 'lucide-react'
import { useRef, type ChangeEvent, type CSSProperties } from 'react'
import type { Shot } from './types'
import { colors, font, radius, shadow } from './theme'
import { baseUrl } from '../../lib/api'
import type { AssetSummary } from '../../lib/shotsApi'

interface MediaBinProps {
	shots: Shot[]
	assets: AssetSummary[]
	attachedAssetIds: string[]
	onToggleAttach: (assetId: string) => void
	activeShotId: string | null
	collapsed: boolean
	onToggleCollapse: () => void
	onSelect: (shotId: string) => void
	onOpenInspector: (shotId: string) => void
	onAddShot: () => void
	onUpload: (file: File) => void
	onAddShotFromAsset?: (asset: AssetSummary) => void
	onPatchShot?: (shotId: string, patch: Partial<Shot>) => void
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
	assets,
	attachedAssetIds,
	onToggleAttach,
	activeShotId,
	collapsed,
	onToggleCollapse,
	onSelect,
	onOpenInspector,
	onAddShot,
	onUpload,
	onAddShotFromAsset,
	onPatchShot
}: MediaBinProps) {
	const fileInputRef = useRef<HTMLInputElement>(null)

	const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) onUpload(file)
		e.target.value = ''
	}

	const onDragStart = (e: React.DragEvent, asset: AssetSummary) => {
		const fullUrl = asset.url.startsWith('http') ? asset.url : `${baseUrl()}${asset.url}`
		e.dataTransfer.setData('text/plain', JSON.stringify({ assetId: asset.id, filename: asset.filename, url: fullUrl }))
		e.dataTransfer.effectAllowed = 'copy'
	}

	const handleDropOnGrid = (e: React.DragEvent) => {
		e.preventDefault()
		try {
			const data = e.dataTransfer.getData('text/plain')
			if (data && onAddShotFromAsset) {
				const { assetId, filename, url } = JSON.parse(data)
				const asset: AssetSummary = { id: assetId, filename, mime_type: 'image/jpeg', url }
				onAddShotFromAsset(asset)
			}
		} catch (err) {
			console.error('Drop failed', err)
		}
	}

	const handleDropOnShot = (e: React.DragEvent, shotId: string) => {
		e.preventDefault()
		e.stopPropagation()
		try {
			const data = e.dataTransfer.getData('text/plain')
			if (data && onPatchShot) {
				const { filename, url } = JSON.parse(data)
				onPatchShot(shotId, {
					keyframeUrl: url,
					status: 'keyframe_ready',
					label: filename.slice(0, 20) + '...'
				})
			}
		} catch (err) {
			console.error('Drop on shot failed', err)
		}
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
					Media Library
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

			<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 10, gap: 16 }}>
				<div>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 2px' }}>
						<span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: colors.textDim, textTransform: 'uppercase' }}>Uploaded Assets</span>
						{attachedAssetIds.length > 0 && (
							<span style={{ fontSize: 9, color: colors.accent, fontFamily: font.mono }}>
								{attachedAssetIds.length} attached
							</span>
						)}
					</div>

					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
						{assets && assets.length > 0 ? (
							assets.map((asset) => {
								const fullUrl = asset.url.startsWith('http') ? asset.url : `${baseUrl()}${asset.url}`
								const isImage = asset.mime_type.startsWith('image/')
								const isVideo = asset.mime_type.startsWith('video/')
								const attached = attachedAssetIds.includes(asset.id)
								return (
									<button
										key={asset.id}
										draggable={true}
										onDragStart={(e) => onDragStart(e, asset)}
										title={attached ? `${asset.filename} — drag to shots, or click to detach` : `${asset.filename} — drag to shots, or click to attach`}
										onClick={() => onToggleAttach(asset.id)}
										style={{
											border: `1px solid ${attached ? colors.accent : colors.border}`,
											borderRadius: radius.md,
											background: colors.surface2,
											boxShadow: attached ? `0 0 0 1px ${colors.accent}` : 'none',
											overflow: 'hidden',
											display: 'flex',
											flexDirection: 'column',
											position: 'relative',
											padding: 0,
											cursor: 'grab',
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
												overflow: 'hidden'
											}}
										>
											{isImage ? (
												<img
													src={fullUrl}
													alt={asset.filename}
													draggable={false}
													style={{ width: '100%', height: '100%', objectFit: 'cover' }}
												/>
											) : isVideo ? (
												<video
													src={fullUrl}
													muted
													playsInline
													style={{ width: '100%', height: '100%', objectFit: 'cover' }}
												/>
											) : (
												<span style={{ fontSize: 16, color: colors.textFaint }}>📄</span>
											)}

											<span
												style={{
													position: 'absolute',
													top: 4,
													right: 4,
													fontSize: 8,
													fontWeight: 700,
													letterSpacing: '0.03em',
													textTransform: 'uppercase',
													padding: '2px 5px',
													borderRadius: radius.sm,
													fontFamily: font.mono,
													background: attached ? colors.accent : 'rgba(10,11,13,0.78)',
													color: attached ? colors.accentText : colors.textFaint,
													border: attached ? 'none' : `1px solid ${colors.borderFaint}`,
												}}
											>
												{attached ? 'attached' : 'attach'}
											</span>
										</div>
										<div
											style={{
												padding: '4px 6px',
												fontSize: 9.5,
												color: colors.textDim,
												whiteSpace: 'nowrap',
												textOverflow: 'ellipsis',
												overflow: 'hidden'
											}}
										>
											{asset.filename}
										</div>
									</button>
								)
							})
						) : (
							<div
								onClick={() => fileInputRef.current?.click()}
								style={{
									gridColumn: 'span 2',
									border: `1px dashed ${colors.borderStrong}`,
									borderRadius: radius.md,
									padding: '16px 8px',
									textAlign: 'center',
									color: colors.textFaint,
									fontSize: 10,
									cursor: 'pointer',
									background: 'rgba(255,255,255,0.01)'
								}}
							>
								No files uploaded.<br/>Click to upload.
							</div>
						)}
					</div>
				</div>

				<div style={{ height: 1, background: colors.border }} />

				<div>
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, padding: '0 2px' }}>
						<span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: colors.textDim, textTransform: 'uppercase' }}>Storyboard Shots</span>
					</div>

					<div
						onDragOver={(e) => {
							e.preventDefault()
							e.dataTransfer.dropEffect = 'copy'
						}}
						onDrop={handleDropOnGrid}
						style={{
							display: 'grid',
							gridTemplateColumns: '1fr 1fr',
							gap: 8,
							minHeight: 100,
							border: '1px dashed transparent',
							borderRadius: radius.md,
							transition: 'border-color 0.15s ease'
						}}
					>
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
									onDragOver={(e) => {
										e.preventDefault()
										e.dataTransfer.dropEffect = 'copy'
									}}
									onDrop={(e) => handleDropOnShot(e, shot.id)}
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
