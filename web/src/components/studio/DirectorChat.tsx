import { Sparkles } from 'lucide-react'
import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { DirectorMessage, GenerationOptions, Shot } from './types'
import { colors, font, radius, shadow } from './theme'
import Composer from './Composer'
import MessageList from './MessageList'

interface DirectorChatProps {
	messages: DirectorMessage[]
	activeShot: Shot | null
	busy: boolean
	options: GenerationOptions
	onOptionsChange: (options: GenerationOptions) => void
	onSend: (text: string) => void
	onUpload: (file: File) => void
}

const MIN_WIDTH = 280
const MAX_WIDTH = 560
const DEFAULT_WIDTH = 340

export default function DirectorChat({
	messages,
	activeShot,
	busy,
	options,
	onOptionsChange,
	onSend,
	onUpload,
}: DirectorChatProps) {
	const turnsLeft = activeShot ? activeShot.maxTurns - activeShot.turnsUsed : null
	const [width, setWidth] = useState(DEFAULT_WIDTH)

	const beginResize = (e: ReactPointerEvent<HTMLDivElement>) => {
		e.preventDefault()
		const el = e.currentTarget
		el.setPointerCapture(e.pointerId)
		const startX = e.clientX
		const startWidth = width

		const onMove = (ev: PointerEvent) => {
			const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - (ev.clientX - startX)))
			setWidth(next)
		}
		const onUp = (ev: PointerEvent) => {
			el.releasePointerCapture(ev.pointerId)
			el.removeEventListener('pointermove', onMove)
			el.removeEventListener('pointerup', onUp)
		}
		el.addEventListener('pointermove', onMove)
		el.addEventListener('pointerup', onUp)
	}

	return (
		<aside
			style={{
				width,
				flex: 'none',
				borderLeft: `1px solid ${colors.border}`,
				background: colors.surface1,
				boxShadow: shadow.bar,
				display: 'flex',
				flexDirection: 'column',
				position: 'relative',
				zIndex: 20,
			}}
		>
			<div
				onPointerDown={beginResize}
				title="Drag to resize"
				style={{
					position: 'absolute',
					top: 0,
					bottom: 0,
					left: -3,
					width: 6,
					cursor: 'ew-resize',
					zIndex: 21,
					touchAction: 'none',
				}}
			/>
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 10,
					padding: '12px 14px',
					borderBottom: `1px solid ${colors.border}`,
					background: colors.surface2,
				}}
			>
				<div
					style={{
						width: 26,
						height: 26,
						flex: 'none',
						borderRadius: radius.pill,
						background: colors.accentDim,
						border: `1px solid ${colors.accent}`,
						display: 'grid',
						placeItems: 'center',
					}}
				>
					<Sparkles size={13} strokeWidth={1.8} color={colors.accent} />
				</div>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
					<span style={{ fontSize: 13, fontWeight: 600, color: colors.text, fontFamily: font.sans }}>
						Director
					</span>
					<span
						style={{
							fontSize: 10,
							letterSpacing: '0.06em',
							textTransform: 'uppercase',
							color: colors.textFaint,
							fontFamily: font.mono,
							display: 'flex',
							alignItems: 'center',
							gap: 5,
						}}
					>
						<span style={{ width: 5, height: 5, borderRadius: radius.pill, background: colors.clear }} />
						{busy ? 'directing…' : 'ready'}
					</span>
				</div>
			</div>

			<MessageList messages={messages} busy={busy} style={{ flex: 1, overflowY: 'auto', padding: 16 }} />

			{activeShot && (
				<div
					style={{
						margin: '0 14px 10px',
						padding: '7px 11px',
						borderRadius: radius.md,
						border: `1px solid ${colors.border}`,
						background: colors.surface2,
						fontSize: 11,
						color: turnsLeft === 0 ? colors.warning : colors.textFaint,
						display: 'flex',
						justifyContent: 'space-between',
					}}
				>
					<span>{activeShot.label}</span>
					<span>
						{turnsLeft === 0
							? 'edit limit reached — new take needed'
							: `${turnsLeft} of ${activeShot.maxTurns} edits left`}
					</span>
				</div>
			)}

			<div style={{ padding: 14, borderTop: `1px solid ${colors.border}` }}>
				<Composer
					variant="sidebar"
					busy={busy}
					options={options}
					onOptionsChange={onOptionsChange}
					onSend={onSend}
					onUpload={onUpload}
				/>
			</div>
		</aside>
	)
}
