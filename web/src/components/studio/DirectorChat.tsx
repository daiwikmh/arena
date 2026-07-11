import { Sparkles } from 'lucide-react'
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

	return (
		<aside
			style={{
				width: 340,
				flex: 'none',
				borderLeft: `1px solid ${colors.border}`,
				background: colors.surface1,
				boxShadow: shadow.bar,
				display: 'flex',
				flexDirection: 'column',
				zIndex: 20,
			}}
		>
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
