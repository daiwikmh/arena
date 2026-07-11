import { Captions, Folder, LayoutGrid, Mic, Music, Type } from 'lucide-react'
import { colors, radius } from './theme'

export type RailView = 'media' | 'storyboard' | 'music' | 'captions' | 'voice' | 'text'

interface IconRailProps {
	active: RailView
	onSelect: (view: RailView) => void
}

const ITEMS: { view: RailView; label: string; Icon: typeof Folder }[] = [
	{ view: 'media', label: 'Media bin', Icon: Folder },
	{ view: 'storyboard', label: 'Storyboard', Icon: LayoutGrid },
	{ view: 'music', label: 'Music', Icon: Music },
	{ view: 'captions', label: 'Captions', Icon: Captions },
	{ view: 'voice', label: 'Voice', Icon: Mic },
	{ view: 'text', label: 'Text', Icon: Type },
]

export default function IconRail({ active, onSelect }: IconRailProps) {
	return (
		<nav
			style={{
				width: 56,
				flex: 'none',
				background: colors.surface1,
				borderRight: `1px solid ${colors.border}`,
				boxShadow: 'inset -1px 0 0 rgba(0,0,0,.3)',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 4,
				padding: '12px 0',
				zIndex: 20,
			}}
		>
			{ITEMS.map(({ view, label, Icon }) => {
				const isActive = active === view
				return (
					<button
						key={view}
						title={label}
						onClick={() => onSelect(view)}
						style={{
							width: 36,
							height: 36,
							display: 'grid',
							placeItems: 'center',
							border: isActive ? `1px solid ${colors.borderStrong}` : '1px solid transparent',
							borderRadius: radius.md,
							background: isActive ? colors.surface3 : 'transparent',
							color: isActive ? colors.accent : colors.textFaint,
							cursor: 'pointer',
							transition: 'background .12s, color .12s, border-color .12s',
						}}
						onMouseEnter={(e) => {
							if (!isActive) e.currentTarget.style.color = colors.textDim
						}}
						onMouseLeave={(e) => {
							if (!isActive) e.currentTarget.style.color = colors.textFaint
						}}
					>
						<Icon size={18} strokeWidth={1.6} />
					</button>
				)
			})}
		</nav>
	)
}
