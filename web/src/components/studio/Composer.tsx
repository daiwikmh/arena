import { ArrowUp, Paperclip, Settings2 } from 'lucide-react'
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import {
	ASPECT_RATIOS,
	CAMERA_MOVEMENTS,
	MODEL_TARGET_LABEL,
	MODEL_TARGETS,
	type GenerationOptions,
} from './types'
import { colors, font, radius, shadow } from './theme'
import DraggableCard from './DraggableCard'

interface ComposerProps {
	variant: 'hero' | 'sidebar'
	busy: boolean
	options: GenerationOptions
	onOptionsChange: (options: GenerationOptions) => void
	onSend: (text: string) => void
	onUpload: (file: File) => void
	placeholder?: string
}

export default function Composer({
	variant,
	busy,
	options,
	onOptionsChange,
	onSend,
	onUpload,
	placeholder,
}: ComposerProps) {
	const [value, setValue] = useState('')
	const [menuOpen, setMenuOpen] = useState(false)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const hero = variant === 'hero'

	const submit = () => {
		if (busy || !value.trim()) return
		onSend(value.trim())
		setValue('')
	}

	const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) onUpload(file)
		e.target.value = ''
	}

	const initial = hero
		? { left: (typeof window !== 'undefined' ? window.innerWidth / 2 : 480) - 140, top: 140 }
		: { left: (typeof window !== 'undefined' ? window.innerWidth : 1000) - 300, top: 200 }

	return (
		<div style={{ position: 'relative' }}>
			<div
				style={{
					display: 'flex',
					alignItems: 'flex-end',
					gap: hero ? 8 : 6,
					background: colors.surface2,
					border: `1px solid ${colors.border}`,
					borderRadius: radius.lg,
					boxShadow: hero ? shadow.glow : shadow.card,
					padding: hero ? 12 : 8,
				}}
			>
				<button
					onClick={() => setMenuOpen((v) => !v)}
					title="Generation options"
					style={{
						...roundIconStyle,
						width: hero ? 34 : 28,
						height: hero ? 34 : 28,
						background: menuOpen ? colors.accentDim : colors.surface3,
						color: menuOpen ? colors.white : colors.textDim,
					}}
				>
					<Settings2 size={hero ? 16 : 14} strokeWidth={1.8} />
				</button>

				<input ref={fileInputRef} type="file" accept="image/*,video/*" hidden onChange={handleFileChange} />
				<button
					onClick={() => fileInputRef.current?.click()}
					title="Upload reference image or video"
					style={{
						...roundIconStyle,
						width: hero ? 34 : 28,
						height: hero ? 34 : 28,
						background: colors.surface3,
						color: colors.textDim,
					}}
				>
					<Paperclip size={hero ? 16 : 14} strokeWidth={1.8} />
				</button>

				<textarea
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter' && !e.shiftKey) {
							e.preventDefault()
							submit()
						}
					}}
					disabled={busy}
					rows={hero ? 3 : 2}
					placeholder={placeholder ?? "What story do you want to tell? I'll help you make shots, swaps, and cuts…"}
					style={{
						flex: 1,
						resize: 'none',
						border: 0,
						background: 'transparent',
						color: colors.text,
						outline: 'none',
						fontSize: hero ? 15 : 13,
						fontFamily: 'inherit',
						lineHeight: 1.45,
						padding: hero ? '6px 4px' : '4px 2px',
					}}
				/>
				<button
					onClick={submit}
					disabled={busy || !value.trim()}
					style={{
						...roundIconStyle,
						width: hero ? 34 : 28,
						height: hero ? 34 : 28,
						background: busy || !value.trim() ? colors.surface3 : colors.white,
						color: busy || !value.trim() ? colors.textFaint : colors.black,
						cursor: busy || !value.trim() ? 'default' : 'pointer',
					}}
				>
					<ArrowUp size={hero ? 16 : 14} strokeWidth={2} />
				</button>
			</div>

			{menuOpen && (
				<DraggableCard title="Next generation" initial={initial} onClose={() => setMenuOpen(false)}>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
						<Field label="Model">
							<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
								{MODEL_TARGETS.map((target) => {
									const on = options.target === target
									return (
										<button
											key={target}
											onClick={() => onOptionsChange({ ...options, target })}
											style={{
												padding: '8px 10px',
												fontSize: 11.5,
												textAlign: 'left',
												border: `1px solid ${on ? colors.accent : colors.border}`,
												borderRadius: radius.md,
												background: on ? colors.accentDim : colors.surface3,
												color: on ? colors.white : colors.textDim,
												cursor: 'pointer',
											}}
										>
											{MODEL_TARGET_LABEL[target]}
										</button>
									)
								})}
							</div>
						</Field>

						<Field label="Aspect ratio">
							<select
								value={options.aspectRatio}
								onChange={(e) => onOptionsChange({ ...options, aspectRatio: e.target.value })}
								style={selectStyle}
							>
								{ASPECT_RATIOS.map((ratio) => (
									<option key={ratio} value={ratio}>
										{ratio}
									</option>
								))}
							</select>
						</Field>

						{options.target === 'keyframe' && (
							<Field label="Camera movement">
								<select
									value={options.cameraMovement}
									onChange={(e) =>
										onOptionsChange({ ...options, cameraMovement: e.target.value as GenerationOptions['cameraMovement'] })
									}
									style={selectStyle}
								>
									{CAMERA_MOVEMENTS.map((movement) => (
										<option key={movement} value={movement}>
											{movement.replace('_', ' ')}
										</option>
									))}
								</select>
							</Field>
						)}

						<Field label="Duration (seconds)">
							<input
								type="number"
								min={1}
								max={10}
								value={options.durationSec}
								onChange={(e) => onOptionsChange({ ...options, durationSec: Number(e.target.value) })}
								style={selectStyle}
							/>
						</Field>
					</div>
				</DraggableCard>
			)}
		</div>
	)
}

function Field({ label, children }: { label: string; children: ReactNode }) {
	return (
		<label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
			<span style={{ fontSize: 10.5, color: colors.textFaint }}>{label}</span>
			{children}
		</label>
	)
}

const roundIconStyle = {
	flex: 'none' as const,
	display: 'grid',
	placeItems: 'center' as const,
	border: 0,
	borderRadius: radius.pill,
	cursor: 'pointer',
}

const selectStyle = {
	width: '100%',
	height: 30,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm,
	background: colors.surface3,
	color: colors.text,
	fontSize: 12,
	padding: '0 8px',
	fontFamily: font.sans,
}
