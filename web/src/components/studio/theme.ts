// Palette referenced from video-editor (shadcn zinc, dark)
export const colors = {
	black: '#000000',
	surface0: '#09090B',
	surface1: '#0E0E10',
	surface2: '#18181B',
	surface3: '#202023',
	surface4: '#27272A',

	border: '#27272A',
	borderStrong: '#3F3F46',
	borderFaint: '#1C1C1F',

	white: '#FAFAFA',
	text: '#FAFAFA',
	textDim: '#A1A1AA',
	textFaint: '#71717A',

	accent: '#FAFAFA',
	accentDim: '#27272A',
	accentText: '#09090B',

	critical: '#D4D4D8',
	warning: '#A1A1AA',
	clear: '#FAFAFA',
} as const

export const radius = {
	sm: 4,
	md: 8,
	lg: 12,
	pill: 999,
} as const

export const shadow = {
	bar: '0 1px 0 rgba(0,0,0,.5), 0 6px 20px -10px rgba(0,0,0,.65)',
	card: '0 1px 2px rgba(0,0,0,.4), 0 10px 24px -14px rgba(0,0,0,.6)',
	elevated: '0 4px 14px rgba(0,0,0,.5), 0 28px 56px -24px rgba(0,0,0,.8)',
	glow: '0 0 0 1px rgba(250,250,250,.14), 0 8px 30px -12px rgba(0,0,0,.7)',
} as const

export const font = {
	mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
	sans: 'system-ui, -apple-system, "Segoe UI", sans-serif',
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
