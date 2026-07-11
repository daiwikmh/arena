import type { BrandSpec, FormatSpec, LocaleSpec } from './api'

export const DEFAULT_BRAND: BrandSpec = {
	wordmark: 'PRESSCHECK',
	legal: 'Type that never breaks.',
	palette: ['#14171C', '#00A3C4'],
	logo_asset: null,
}

export const DEFAULT_LOCALES: LocaleSpec[] = [
	{
		code: 'en-US',
		language: 'English',
		direction: 'ltr',
		headline: 'Wake up slower.',
		legal: 'Cold brew. 2x caffeine.',
	},
	{
		code: 'de-DE',
		language: 'German',
		direction: 'ltr',
		headline: 'Wach langsamer auf.',
		legal: 'Cold Brew. Doppelt Koffein.',
	},
	{
		code: 'ar-EG',
		language: 'Arabic',
		direction: 'rtl',
		headline: 'استيقظ على مهلك',
		legal: 'قهوة باردة',
	},
	{
		code: 'ja-JP',
		language: 'Japanese',
		direction: 'ltr',
		headline: 'ゆっくり目覚めよう',
		legal: 'コールドブリュー',
	},
	{
		code: 'hi-IN',
		language: 'Hindi',
		direction: 'ltr',
		headline: 'धीरे जागिए।',
		legal: 'कोल्ड ब्रू',
	},
]

export const DEFAULT_FORMATS: FormatSpec[] = [
	{ id: '1:1', width_ratio: 1, height_ratio: 1 },
	{ id: '3:2', width_ratio: 3, height_ratio: 2 },
	{ id: '2:3', width_ratio: 2, height_ratio: 3 },
	{ id: '3:4', width_ratio: 3, height_ratio: 4 },
	{ id: '4:3', width_ratio: 4, height_ratio: 3 },
	{ id: '4:5', width_ratio: 4, height_ratio: 5 },
	{ id: '5:4', width_ratio: 5, height_ratio: 4 },
	{ id: '9:16', width_ratio: 9, height_ratio: 16 },
	{ id: '16:9', width_ratio: 16, height_ratio: 9 },
	{ id: '21:9', width_ratio: 21, height_ratio: 9 },
]
