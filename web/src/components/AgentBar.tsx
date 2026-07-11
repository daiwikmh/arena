import { useState } from 'react'

interface AgentBarProps {
	status: string | null
	busy: boolean
	onSubmit: (text: string) => void
}

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'

export default function AgentBar({ status, busy, onSubmit }: AgentBarProps) {
	const [value, setValue] = useState('')

	const submit = () => {
		if (busy || !value.trim()) return
		onSubmit(value.trim())
		setValue('')
	}

	return (
		<div
			style={{
				position: 'fixed',
				left: '50%',
				bottom: 22,
				transform: 'translateX(-50%)',
				width: 'min(640px, calc(100vw - 64px))',
				zIndex: 40,
			}}
		>
			<div
				style={{
					background: '#1F242A',
					border: '1px solid #3D444C',
					borderRadius: 6,
					boxShadow: '0 2px 6px rgba(0,0,0,.55), 0 20px 48px -20px rgba(0,0,0,.85)',
					overflow: 'hidden',
				}}
			>
				{status && (
					<div
						style={{
							display: 'flex',
							alignItems: 'center',
							gap: 10,
							padding: '8px 12px',
							borderBottom: '1px solid #2C3238',
							background: '#181C21',
							fontSize: 12,
							color: '#9AA1A9',
						}}
					>
						<span
							style={{
								width: 6,
								height: 6,
								borderRadius: '50%',
								background: '#34BEDC',
								flex: 'none',
								opacity: busy ? 1 : 0.4,
							}}
						/>
						<span>{status}</span>
					</div>
				)}

				<div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 13px' }}>
					<span style={{ color: '#34BEDC', display: 'grid', placeItems: 'center' }}>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
							<path d="M8 1.6l1.7 4.7 4.7 1.7-4.7 1.7L8 14.4l-1.7-4.7L1.6 8l4.7-1.7z" />
						</svg>
					</span>
					<input
						value={value}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') submit()
						}}
						disabled={busy}
						placeholder="Describe the campaign — the agent plans, generates, and reviews it…"
						style={{
							flex: 1,
							border: 0,
							background: 'transparent',
							color: '#E6E9EC',
							outline: 'none',
							minWidth: 0,
							fontSize: 14,
							fontFamily: 'inherit',
						}}
					/>
					<button
						onClick={submit}
						disabled={busy || !value.trim()}
						style={{
							height: 28,
							padding: '0 12px',
							border: 0,
							borderRadius: 3,
							background: busy || !value.trim() ? '#3D444C' : '#E6E9EC',
							color: busy || !value.trim() ? '#9AA1A9' : '#14171C',
							fontSize: 12,
							fontWeight: 560,
							cursor: busy || !value.trim() ? 'default' : 'pointer',
							whiteSpace: 'nowrap',
							fontFamily: MONO,
						}}
					>
						{busy ? 'Working…' : 'Send'}
					</button>
				</div>
			</div>
		</div>
	)
}
