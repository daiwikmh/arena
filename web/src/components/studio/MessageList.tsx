import type { CSSProperties } from 'react'
import type { DirectorMessage } from './types'
import { colors, radius } from './theme'

interface MessageListProps {
	messages: DirectorMessage[]
	busy: boolean
	style?: CSSProperties
}

export default function MessageList({ messages, busy, style }: MessageListProps) {
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
			{messages.map((m) => (
				<div
					key={m.id}
					style={{
						alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
						maxWidth: '90%',
						padding: '10px 13px',
						borderRadius: radius.lg,
						border: `1px solid ${m.role === 'director' ? colors.borderStrong : colors.border}`,
						borderLeft: m.role === 'director' ? `3px solid ${colors.accent}` : `1px solid ${colors.border}`,
						background: m.role === 'user' ? colors.surface3 : colors.surface2,
						fontSize: 13,
						lineHeight: 1.55,
						fontFamily: 'inherit',
						color: m.role === 'director' ? colors.text : colors.textDim,
						boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
					}}
				>
					{m.text}
				</div>
			))}
			{busy && (
				<div style={{ alignSelf: 'flex-start', fontSize: 13.5, color: colors.textFaint, padding: '2px 4px' }}>
					Directing…
				</div>
			)}
		</div>
	)
}
