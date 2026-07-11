import { useState, type CSSProperties } from 'react'
import {
	Search,
	Compass,
	FolderOpen,
	Library,
	Plus,
	Grid,
	Layers,
	Film,
	Mic,
	Music,
	Type,
	Bell,
	Palette,
	GraduationCap,
	Moon,
	MoreHorizontal,
	Menu,
	Sparkles,
	ChevronLeft,
	ChevronRight
} from 'lucide-react'
import { colors, font, radius } from './theme'
import type { RailView } from './IconRail'

interface LeftSidebarProps {
	active: RailView
	onSelect: (view: RailView) => void
	onHomeClick?: () => void
}

export default function LeftSidebar({ active, onSelect, onHomeClick }: LeftSidebarProps) {
	const [collapsed, setCollapsed] = useState(false)

	const menuItems = [
		{ id: 'media' as RailView, label: 'Home', Icon: Grid },
		{ id: 'storyboard' as RailView, label: 'Storyboard', Icon: Layers },
		{ id: 'music' as RailView, label: 'Music & SFX', Icon: Music },
		{ id: 'captions' as RailView, label: 'Subtitles', Icon: Film },
		{ id: 'voice' as RailView, label: 'Voiceover', Icon: Mic },
		{ id: 'text' as RailView, label: 'Designer Text', Icon: Type },
	]

	const mockPrimaryItems = [
		{ label: 'Search', Icon: Search },
		{ label: 'Explore', Icon: Compass },
		{ label: 'Projects', Icon: FolderOpen },
		{ label: 'Library', Icon: Library },
	]

	const secondaryItems = [
		{ id: 'media' as RailView, label: 'All tools', Icon: Grid },
		{ id: 'storyboard' as RailView, label: 'Storyboard Canvas', Icon: Layers },
		{ id: 'media' as RailView, label: 'Image Generator', Icon: Sparkles },
		{ id: 'storyboard' as RailView, label: 'Video Generator', Icon: Film },
		{ id: 'voice' as RailView, label: 'Voice Generator', Icon: Mic },
		{ id: 'text' as RailView, label: 'Designer Titles', Icon: Type },
	]

	if (collapsed) {
		return (
			<nav
				style={{
					width: 56,
					flex: 'none',
					background: colors.surface1,
					borderRight: `1px solid ${colors.border}`,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					padding: '12px 0',
					gap: 12,
					zIndex: 30,
					transition: 'width 0.2s ease-in-out'
				}}
			>
				<img
					src="/logo.png"
					alt="Arena"
					onClick={onHomeClick}
					title="Go to Landing Dashboard"
					style={{ ...collapsedLogoStyle, cursor: onHomeClick ? 'pointer' : 'default' }}
				/>

				<button
					onClick={() => setCollapsed(false)}
					style={collapsedIconHeaderStyle}
					title="Expand navigation bar"
				>
					<Menu size={16} color={colors.textDim} />
				</button>

				<div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, width: '100%', alignItems: 'center', marginTop: 12 }}>
					{menuItems.map(({ id, label, Icon }) => {
						const isActive = active === id
						return (
							<button
								key={id}
								onClick={() => {
									if (label === 'Home') {
										onHomeClick?.()
									} else {
										onSelect(id)
									}
								}}
								title={label}
								style={{
									...miniIconBtnStyle,
									background: isActive ? colors.surface3 : 'transparent',
									color: isActive ? colors.accent : colors.textDim
								}}
							>
								<Icon size={16} strokeWidth={1.8} />
							</button>
						)
					})}
				</div>

				{/* Collapsed Bottom Items */}
				<div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
					<button style={miniBottomBtnStyle} title="Notifications">
						<Bell size={13} color={colors.textFaint} />
					</button>
					<button style={miniBottomBtnStyle} title="Theme Config">
						<Moon size={13} color={colors.textFaint} />
					</button>
				</div>
			</nav>
		)
	}

	return (
		<nav
			style={{
				width: 240,
				flex: 'none',
				background: colors.surface1,
				borderRight: `1px solid ${colors.border}`,
				display: 'flex',
				flexDirection: 'column',
				padding: '16px 12px 14px',
				zIndex: 30,
				overflowY: 'auto',
				transition: 'width 0.2s ease-in-out'
			}}
		>
			{/* Logo and collapse */}
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingLeft: 6 }}>
				<div
					onClick={onHomeClick}
					style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
					title="Go to Landing Dashboard"
				>
					<img src="/logo.png" alt="Arena" style={logoBadgeStyle} />
					<span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: colors.text }}>
						Arena<sup style={{ fontSize: 8, fontWeight: 500, opacity: 0.7 }}>TM</sup>
					</span>
				</div>
				<button
					onClick={() => setCollapsed(true)}
					style={panelToggleBtnStyle}
					title="Collapse navigation bar"
				>
					<ChevronLeft size={14} color={colors.textDim} />
				</button>
			</div>

			{/* Main Links */}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 18 }}>
				{/* Map the active view */}
				{menuItems.slice(0, 2).map(({ id, label, Icon }) => {
					const isActive = active === id
					return (
						<button
							key={id}
							onClick={() => {
								if (label === 'Home') {
									onHomeClick?.()
								} else {
									onSelect(id)
								}
							}}
							style={{
								...navRowStyle,
								background: isActive ? colors.surface3 : 'transparent',
								color: isActive ? colors.accent : colors.textDim
							}}
						>
							<Icon size={14} style={{ marginRight: 10 }} />
							<span style={{ fontSize: 12, fontWeight: isActive ? 600 : 500 }}>{label}</span>
						</button>
					)
				})}

				{mockPrimaryItems.map(({ label, Icon }) => (
					<button
						key={label}
						onClick={() => onSelect('media')}
						style={{ ...navRowStyle, color: colors.textDim }}
					>
						<Icon size={14} style={{ marginRight: 10 }} />
						<span style={{ fontSize: 12, fontWeight: 500 }}>{label}</span>
					</button>
				))}
			</div>

			{/* Divider */}
			<div style={{ height: 1, backgroundColor: colors.border, margin: '0 4px 14px' }} />

			{/* Secondary Active Tool Sections (All local tools patched) */}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
				<span style={{ fontSize: 9.5, fontWeight: 600, color: colors.textFaint, textTransform: 'uppercase', letterSpacing: '0.08em', paddingLeft: 10, marginBottom: 6 }}>
					Interactive Tools
				</span>

				{secondaryItems.map((item, idx) => {
					const isActive = active === item.id
					return (
						<button
							key={idx}
							onClick={() => onSelect(item.id)}
							style={{
								...navRowStyle,
								background: isActive ? colors.surface3 : 'transparent',
								color: isActive ? colors.accent : colors.textDim
							}}
						>
							<item.Icon size={14} style={{ marginRight: 10 }} />
							<span style={{ fontSize: 12, fontWeight: isActive ? 600 : 500 }}>{item.label}</span>
						</button>
					)
				})}
			</div>

			{/* Bottom Controls */}
			<div style={{ marginTop: 'auto', paddingTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${colors.border}` }}>
				<div style={{ display: 'flex', gap: 1 }}>
					<button style={bottomIconStyle} title="Brush Layout">
						<Palette size={13} />
					</button>
					<button style={bottomIconStyle} title="Documentation">
						<GraduationCap size={13} />
					</button>
					<button title="19 Unread Messages" style={{ ...bottomIconStyle, position: 'relative' }}>
						<Bell size={13} />
						<span style={badgeStyle}>19</span>
					</button>
					<button style={bottomIconStyle} title="Dark Mode Toggle">
						<Moon size={13} />
					</button>
				</div>
				<button style={bottomIconStyle} title="More Configs">
					<MoreHorizontal size={13} />
				</button>
			</div>
		</nav>
	)
}

const logoBadgeStyle: CSSProperties = {
	width: 22,
	height: 22,
	borderRadius: 5,
	objectFit: 'contain',
	flex: 'none'
}

const collapsedLogoStyle: CSSProperties = {
	width: 24,
	height: 24,
	objectFit: 'contain',
	marginBottom: 10,
}

const collapsedIconHeaderStyle: CSSProperties = {
	width: 32,
	height: 32,
	display: 'grid',
	placeItems: 'center',
	border: 0,
	background: 'transparent',
	cursor: 'pointer',
	borderRadius: radius.sm,
	marginBottom: 6
}

const miniIconBtnStyle: CSSProperties = {
	width: 36,
	height: 36,
	display: 'grid',
	placeItems: 'center',
	border: 0,
	borderRadius: radius.md,
	cursor: 'pointer',
	transition: 'background-color 0.12s, color 0.12s'
}

const miniBottomBtnStyle: CSSProperties = {
	width: 28,
	height: 28,
	display: 'grid',
	placeItems: 'center',
	border: 0,
	background: 'transparent',
	cursor: 'pointer'
}

const panelToggleBtnStyle: CSSProperties = {
	width: 24,
	height: 24,
	border: `1px solid ${colors.borderStrong}`,
	background: 'transparent',
	cursor: 'pointer',
	borderRadius: radius.sm,
	display: 'grid',
	placeItems: 'center'
}

const navRowStyle: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	width: '100%',
	height: 32,
	padding: '0 10px',
	borderRadius: radius.md,
	background: 'transparent',
	border: 0,
	textAlign: 'left',
	cursor: 'pointer',
	transition: 'background-color 0.1s ease, color 0.1s'
}

const bottomIconStyle: CSSProperties = {
	width: 26,
	height: 26,
	display: 'grid',
	placeItems: 'center',
	background: 'transparent',
	border: 0,
	borderRadius: radius.sm,
	color: colors.textDim,
	cursor: 'pointer',
	transition: 'color 0.1s'
}

const badgeStyle: CSSProperties = {
	position: 'absolute',
	top: -2,
	right: -2,
	background: colors.critical,
	color: colors.white,
	fontSize: 7.5,
	fontWeight: 800,
	borderRadius: radius.pill,
	padding: '1px 3px',
	border: `1px solid ${colors.surface1}`
}
