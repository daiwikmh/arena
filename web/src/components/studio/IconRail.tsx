import { Captions, Folder, LayoutGrid, Mic, Music, Type } from 'lucide-react'

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
				background: '#14171A',
				borderRight: '1px solid #2C3238',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: 4,
				padding: '12px 0',
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
							border: 0,
							borderRadius: 6,
							background: isActive ? '#1F242A' : 'transparent',
							color: isActive ? '#E6E9EC' : '#6B727A',
							cursor: 'pointer',
						}}
					>
						<Icon size={18} strokeWidth={1.6} />
					</button>
				)
			})}
		</nav>
	)
}
