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
	Radio,
	ChevronLeft,
	ChevronRight
} from 'lucide-react'
import { colors, font, radius } from './theme'
import type { RailView } from './IconRail'

interface LeftSidebarProps {
	active: RailView
	onSelect: (view: RailView) => void
	onHomeClick?: () => void
	onGoLive?: () => void
}

export default function LeftSidebar({ active, onSelect, onHomeClick, onGoLive }: LeftSidebarProps) {
	const [collapsed, setCollapsed] = useState(false)

	const menuItems = [
		{ id: 'media' as RailView, label: 'Home', Icon: Grid },
		{ id: 'storyboard' as RailView, label: 'Storyboard', Icon: Layers },
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

				{onGoLive && (
					<button onClick={onGoLive} style={collapsedLiveBtnStyle} title="Go Live — voice-directed camera effects">
						<Radio size={15} color={colors.accentText} />
					</button>
				)}

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

			{/* Go Live — the headline feature */}
			{onGoLive && (
				<button onClick={onGoLive} style={liveButtonStyle} title="Voice-directed camera effects, live">
					<Radio size={15} style={{ marginRight: 8 }} strokeWidth={2.2} />
					<span style={{ fontSize: 12.5, fontWeight: 700 }}>Go Live</span>
				</button>
			)}

			{/* Main Links */}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
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

const liveButtonStyle: CSSProperties = {
	width: '100%',
	height: 36,
	borderRadius: radius.md,
	background: colors.accent,
	color: colors.accentText,
	border: 0,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	cursor: 'pointer',
	marginBottom: 18,
	boxShadow: '0 4px 12px rgba(172,191,164,0.25)',
	transition: 'opacity 0.15s ease'
}

const collapsedLiveBtnStyle: CSSProperties = {
	width: 34,
	height: 34,
	borderRadius: radius.pill,
	background: colors.accent,
	border: 0,
	display: 'grid',
	placeItems: 'center',
	cursor: 'pointer',
	marginBottom: 4
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
