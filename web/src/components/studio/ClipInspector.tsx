import { RotateCcw, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { ASPECT_RATIOS, CAMERA_MOVEMENTS, DEFAULT_FILTERS, filtersToCss, type Shot, type ShotFilters } from './types'
import { colors, font, radius, shadow } from './theme'

interface ClipInspectorProps {
	shot: Shot
	onClose: () => void
	onPatch: (patch: Partial<Shot>) => void
	onRegenerateKeyframe: () => void
	onGenerateClip: () => void
	busy: boolean
}

export default function ClipInspector({
	shot,
	onClose,
	onPatch,
	onRegenerateKeyframe,
	onGenerateClip,
	busy,
}: ClipInspectorProps) {
	const media = shot.clipUrl ?? shot.keyframeUrl
	const isVideo = Boolean(shot.clipUrl)

	const setFilter = (key: keyof ShotFilters, value: number) => {
		onPatch({ filters: { ...shot.filters, [key]: value } })
	}

	return (
		<div
			style={{
				position: 'absolute',
				inset: 0,
				background: 'rgba(5,6,8,0.72)',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				zIndex: 50,
			}}
			onClick={onClose}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{
					width: 860,
					maxWidth: '92vw',
					maxHeight: '88vh',
					display: 'flex',
					background: colors.surface1,
					border: `1px solid ${colors.borderStrong}`,
					borderRadius: radius.lg,
					boxShadow: shadow.elevated,
					overflow: 'hidden',
				}}
			>
				<div style={{ flex: '1 1 55%', background: colors.black, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
					{media ? (
						isVideo ? (
							<video
								src={media}
								controls
								style={{ maxWidth: '100%', maxHeight: '88vh', filter: filtersToCss(shot.filters) }}
							/>
						) : (
							<img
								src={media}
								alt={shot.label}
								style={{ maxWidth: '100%', maxHeight: '88vh', filter: filtersToCss(shot.filters) }}
							/>
						)
					) : (
						<span style={{ color: colors.textFaint, fontSize: 12, fontFamily: font.mono }}>no media yet</span>
					)}
				</div>

				<div style={{ flex: '1 1 45%', display: 'flex', flexDirection: 'column', minWidth: 300 }}>
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							padding: '10px 14px',
							borderBottom: `1px solid ${colors.border}`,
							background: colors.surface2,
						}}
					>
						<span style={{ fontSize: 13, color: colors.text }}>{shot.label}</span>
						<span style={{ flex: 1 }} />
						<button onClick={onClose} style={closeButtonStyle}>
							<X size={14} strokeWidth={2} color={colors.textFaint} />
						</button>
					</div>

					<div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 18 }}>
						<Section label="Trim">
							<Row>
								<NumberField
									label="In (s)"
									value={shot.trimStartSec}
									min={0}
									max={shot.trimEndSec}
									step={0.1}
									onChange={(v) => onPatch({ trimStartSec: Math.min(v, shot.trimEndSec) })}
								/>
								<NumberField
									label="Out (s)"
									value={shot.trimEndSec}
									min={shot.trimStartSec}
									max={shot.durationSec}
									step={0.1}
									onChange={(v) => onPatch({ trimEndSec: Math.max(v, shot.trimStartSec) })}
								/>
							</Row>
							<input
								type="range"
								min={0}
								max={shot.durationSec}
								step={0.1}
								value={shot.trimEndSec}
								onChange={(e) => onPatch({ trimEndSec: Math.max(Number(e.target.value), shot.trimStartSec) })}
								style={{ width: '100%' }}
							/>
						</Section>

						<Section label="Filters" action={<ResetButton onClick={() => onPatch({ filters: { ...DEFAULT_FILTERS } })} />}>
							<SliderField label="Brightness" value={shot.filters.brightness} min={0} max={200} onChange={(v) => setFilter('brightness', v)} />
							<SliderField label="Contrast" value={shot.filters.contrast} min={0} max={200} onChange={(v) => setFilter('contrast', v)} />
							<SliderField label="Saturation" value={shot.filters.saturation} min={0} max={200} onChange={(v) => setFilter('saturation', v)} />
							<SliderField label="Hue" value={shot.filters.hue} min={0} max={360} unit="°" onChange={(v) => setFilter('hue', v)} />
						</Section>

						<Section label="Camera & framing">
							<Row>
								<SelectField
									label="Movement"
									value={shot.cameraMovement}
									options={CAMERA_MOVEMENTS}
									onChange={(v) => onPatch({ cameraMovement: v as Shot['cameraMovement'] })}
								/>
								<SelectField
									label="Aspect ratio"
									value={shot.aspectRatio}
									options={[...ASPECT_RATIOS]}
									onChange={(v) => onPatch({ aspectRatio: v })}
								/>
							</Row>
						</Section>

						<Section label="Status">
							<div style={{ fontSize: 12, color: colors.textDim, lineHeight: 1.6 }}>
								{shot.status} · {shot.turnsUsed} of {shot.maxTurns} edits used
							</div>
						</Section>
					</div>

					<div style={{ padding: 14, borderTop: `1px solid ${colors.border}`, display: 'flex', gap: 8 }}>
						<button
							onClick={onRegenerateKeyframe}
							disabled={busy}
							style={{ ...actionButtonStyle, background: colors.surface3, color: colors.text }}
						>
							Regenerate keyframe
						</button>
						<button
							onClick={onGenerateClip}
							disabled={busy || !shot.keyframeUrl}
							style={{
								...actionButtonStyle,
								background: !shot.keyframeUrl || busy ? colors.surface3 : colors.white,
								color: !shot.keyframeUrl || busy ? colors.textFaint : colors.black,
							}}
						>
							Animate clip
						</button>
					</div>
				</div>
			</div>
		</div>
	)
}

function Section({ label, action, children }: { label: string; action?: ReactNode; children: ReactNode }) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
			<div style={{ display: 'flex', alignItems: 'center' }}>
				<span
					style={{
						fontSize: 10,
						letterSpacing: '0.08em',
						textTransform: 'uppercase',
						color: colors.textFaint,
						fontFamily: font.mono,
					}}
				>
					{label}
				</span>
				<span style={{ flex: 1 }} />
				{action}
			</div>
			{children}
		</div>
	)
}

function Row({ children }: { children: React.ReactNode }) {
	return <div style={{ display: 'flex', gap: 10 }}>{children}</div>
}

function ResetButton({ onClick }: { onClick: () => void }) {
	return (
		<button onClick={onClick} title="Reset filters" style={{ ...closeButtonStyle, width: 20, height: 20 }}>
			<RotateCcw size={11} strokeWidth={2} color={colors.textFaint} />
		</button>
	)
}

function NumberField({
	label,
	value,
	min,
	max,
	step,
	onChange,
}: {
	label: string
	value: number
	min: number
	max: number
	step: number
	onChange: (v: number) => void
}) {
	return (
		<label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
			<span style={{ fontSize: 10.5, color: colors.textFaint }}>{label}</span>
			<input
				type="number"
				value={value}
				min={min}
				max={max}
				step={step}
				onChange={(e) => onChange(Number(e.target.value))}
				style={inputStyle}
			/>
		</label>
	)
}

function SliderField({
	label,
	value,
	min,
	max,
	unit = '%',
	onChange,
}: {
	label: string
	value: number
	min: number
	max: number
	unit?: string
	onChange: (v: number) => void
}) {
	return (
		<label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
			<span style={{ fontSize: 10.5, color: colors.textFaint, display: 'flex', justifyContent: 'space-between' }}>
				<span>{label}</span>
				<span style={{ color: colors.textDim, fontFamily: font.mono }}>
					{value}
					{unit}
				</span>
			</span>
			<input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%' }} />
		</label>
	)
}

function SelectField({
	label,
	value,
	options,
	onChange,
}: {
	label: string
	value: string
	options: string[]
	onChange: (v: string) => void
}) {
	return (
		<label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
			<span style={{ fontSize: 10.5, color: colors.textFaint }}>{label}</span>
			<select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
				{options.map((opt) => (
					<option key={opt} value={opt}>
						{opt.replace('_', ' ')}
					</option>
				))}
			</select>
		</label>
	)
}

const closeButtonStyle = {
	width: 24,
	height: 24,
	display: 'grid',
	placeItems: 'center' as const,
	border: 0,
	borderRadius: radius.pill,
	background: colors.surface3,
	cursor: 'pointer',
}

const inputStyle = {
	width: '100%',
	height: 28,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm,
	background: colors.surface3,
	color: colors.text,
	fontSize: 12,
	padding: '0 8px',
}

const actionButtonStyle = {
	flex: 1,
	height: 34,
	border: 0,
	borderRadius: radius.md,
	fontSize: 12.5,
	cursor: 'pointer',
}
