import { ArrowUp } from 'lucide-react'
import { useState } from 'react'
import type { DirectorMessage, Shot } from './types'

interface DirectorChatProps {
	messages: DirectorMessage[]
	activeShot: Shot | null
	busy: boolean
	onSend: (text: string) => void
}

export default function DirectorChat({ messages, activeShot, busy, onSend }: DirectorChatProps) {
	const [value, setValue] = useState('')

	const submit = () => {
		if (busy || !value.trim()) return
		onSend(value.trim())
		setValue('')
	}

	const turnsLeft = activeShot ? activeShot.maxTurns - activeShot.turnsUsed : null

	return (
		<aside
			style={{
				width: 320,
				borderLeft: '1px solid #2C3238',
				background: '#14171A',
				display: 'flex',
				flexDirection: 'column',
			}}
		>
			<div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
				{messages.map((m) => (
					<div
						key={m.id}
						style={{
							display: 'flex',
							gap: 8,
							alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
							maxWidth: '92%',
						}}
					>
						{m.role === 'director' && (
							<span style={{ width: 2, background: '#34BEDC', borderRadius: 1, flex: 'none' }} />
						)}
						<p
							style={{
								margin: 0,
								fontSize: 13.5,
								lineHeight: 1.5,
								color: m.role === 'director' ? '#E6E9EC' : '#9AA1A9',
							}}
						>
							{m.text}
						</p>
					</div>
				))}
				{busy && (
					<div style={{ display: 'flex', gap: 8 }}>
						<span style={{ width: 2, background: '#34BEDC', borderRadius: 1, flex: 'none' }} />
						<p style={{ margin: 0, fontSize: 13.5, color: '#6B727A' }}>Directing…</p>
					</div>
				)}
			</div>

			{activeShot && (
				<div
					style={{
						margin: '0 14px 10px',
						padding: '6px 10px',
						borderRadius: 4,
						background: '#1F242A',
						fontSize: 11,
						color: turnsLeft === 0 ? '#D99A2B' : '#6B727A',
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

			<div style={{ padding: 14, borderTop: '1px solid #1F242A' }}>
				<div
					style={{
						display: 'flex',
						alignItems: 'flex-end',
						gap: 8,
						background: '#1F242A',
						border: '1px solid #2C3238',
						borderRadius: 8,
						padding: 10,
					}}
				>
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
						rows={2}
						placeholder="What story do you want to tell? I'll help you make shots, swaps, and cuts…"
						style={{
							flex: 1,
							resize: 'none',
							border: 0,
							background: 'transparent',
							color: '#E6E9EC',
							outline: 'none',
							fontSize: 13,
							fontFamily: 'inherit',
							lineHeight: 1.4,
						}}
					/>
					<button
						onClick={submit}
						disabled={busy || !value.trim()}
						style={{
							width: 28,
							height: 28,
							flex: 'none',
							display: 'grid',
							placeItems: 'center',
							border: 0,
							borderRadius: '50%',
							background: busy || !value.trim() ? '#2C3238' : '#E6E9EC',
							color: busy || !value.trim() ? '#6B727A' : '#14171C',
							cursor: busy || !value.trim() ? 'default' : 'pointer',
						}}
					>
						<ArrowUp size={14} strokeWidth={2} />
					</button>
				</div>
			</div>
		</aside>
	)
}
