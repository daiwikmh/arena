export const colors = {
	black: '#000000',
	surface0: '#000000',
	surface1: '#0a0a0a',
	surface2: '#121212',
	surface3: '#1c1c1c',
	surface4: '#262626',

	border: '#1c1c1c',
	borderStrong: '#333333',
	borderFaint: '#0d0d0d',

	white: '#ffffff',
	text: '#ffffff',
	textDim: '#a3a3a3',
	textFaint: '#6b6b6b',

	accent: '#ffffff',
	accentDim: '#1a1a1a',
	accentText: '#000000',

	critical: '#ffffff',
	warning: '#ffffff',
	clear: '#ffffff',
} as const

export const radius = {
	sm: 6,
	md: 10,
	lg: 14,
	pill: 999,
} as const

export const shadow = {
	bar: '0 1px 0 rgba(0,0,0,.6), 0 6px 20px -10px rgba(0,0,0,.8)',
	card: '0 1px 3px rgba(0,0,0,.5), 0 10px 24px -14px rgba(0,0,0,.8)',
	elevated: '0 12px 28px rgba(0,0,0,.6), 0 32px 64px -24px rgba(0,0,0,.9)',
	glow: '0 0 0 1px rgba(255,255,255,.1), 0 8px 30px -12px rgba(0,0,0,.8)',
} as const

export const font = {
	mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
	sans: '"Roboto", "Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
	display: '"Roboto", "Instrument Serif", Georgia, serif',
} as const

export const bar = {
	background: colors.surface1,
	border: `1px solid ${colors.border}`,
	boxShadow: shadow.bar,
} as const

export const card = {
	background: colors.surface2,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.md,
	boxShadow: shadow.card,
} as const

export const cardHover = {
	borderColor: colors.borderStrong,
} as const

export const cardActive = {
	borderColor: colors.accent,
	boxShadow: `0 0 0 1px ${colors.accent}, ${shadow.card}`,
} as const
