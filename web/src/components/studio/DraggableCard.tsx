import { GripHorizontal, X } from 'lucide-react'
import { useCallback, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { colors, font, radius, shadow } from './theme'

interface DraggableCardProps {
	title: string
	initial: { left: number; top: number }
	width?: number
	onClose?: () => void
	children: ReactNode
}

export default function DraggableCard({ title, initial, width = 280, onClose, children }: DraggableCardProps) {
	const [pos, setPos] = useState(initial)
	const drag = useRef<{ dx: number; dy: number } | null>(null)

	const onPointerDown = useCallback(
		(e: PointerEvent<HTMLDivElement>) => {
			e.currentTarget.setPointerCapture(e.pointerId)
			drag.current = { dx: e.clientX - pos.left, dy: e.clientY - pos.top }
		},
		[pos],
	)

	const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
		if (!drag.current) return
		const left = Math.max(8, Math.min(window.innerWidth - width - 8, e.clientX - drag.current.dx))
		const top = Math.max(8, Math.min(window.innerHeight - 60, e.clientY - drag.current.dy))
		setPos({ left, top })
	}, [width])

	const onPointerUp = useCallback((e: PointerEvent<HTMLDivElement>) => {
		drag.current = null
		e.currentTarget.releasePointerCapture(e.pointerId)
	}, [])

	return (
		<div
			style={{
				position: 'fixed',
				left: pos.left,
				top: pos.top,
				width,
				background: colors.surface2,
				border: `1px solid ${colors.borderStrong}`,
				borderRadius: radius.lg,
				boxShadow: shadow.elevated,
				zIndex: 60,
				overflow: 'hidden',
			}}
		>
			<div
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					padding: '8px 8px 8px 12px',
					borderBottom: `1px solid ${colors.border}`,
					background: colors.surface3,
					cursor: 'grab',
					touchAction: 'none',
					userSelect: 'none',
				}}
			>
				<GripHorizontal size={13} strokeWidth={1.6} color={colors.textFaint} />
				<span
					style={{
						flex: 1,
						fontSize: 10,
						letterSpacing: '0.09em',
						textTransform: 'uppercase',
						color: colors.textDim,
						fontFamily: font.mono,
					}}
				>
					{title}
				</span>
				{onClose && (
					<button
						onClick={onClose}
						style={{
							width: 22,
							height: 22,
							display: 'grid',
							placeItems: 'center',
							border: 0,
							borderRadius: radius.sm,
							background: 'transparent',
							cursor: 'pointer',
						}}
					>
						<X size={13} strokeWidth={2} color={colors.textFaint} />
					</button>
				)}
			</div>
			<div style={{ padding: 12 }}>{children}</div>
		</div>
	)
}
