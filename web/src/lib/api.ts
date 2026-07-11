export type Direction = 'ltr' | 'rtl'

export interface ObjectRef {
	asset_id: string
	label: string
}

export interface BrandSpec {
	wordmark: string
	legal: string
	palette: string[]
	logo_asset: string | null
}

export interface LocaleSpec {
	code: string
	language: string
	direction: Direction
	headline: string
	legal: string
}

export interface FormatSpec {
	id: string
	width_ratio: number
	height_ratio: number
}

export interface SceneSpec {
	subject: string
	setting: string
	time_of_day: 'dawn' | 'day' | 'dusk' | 'night'
	palette: string[]
	mood: string
	lens_mm: number
	lighting: 'soft' | 'hard' | 'backlit' | 'diffused' | 'golden-hour'
	excludes: string[]
	object_refs: ObjectRef[]
}

export interface LocalizationPlan {
	brand: BrandSpec
	scene: SceneSpec
	locales: LocaleSpec[]
	formats: FormatSpec[]
}

export interface Finding {
	severity: 'critical' | 'warning'
	tier: 'deterministic' | 'vision'
	code: string
	message: string
	locale_code: string
	format_id: string
	fix_hint: string | null
}

export interface Draft {
	id: string
	prompt_hash: string
	template_version: string
	model_id: string
	image_ref: string
	author: 'agent' | 'user'
	interaction_id: string | null
	parent: string | null
	findings: Finding[]
}

export interface CampaignSummary {
	id: string
	plan: LocalizationPlan | null
	cells: number
	flagged_cells: number
	last_fan_out_api_calls: number | null
	last_fan_out_cost_usd: number | null
}

export interface FanOutResponse {
	wall_clock_seconds: number
	api_calls: number
	cache_hits: number
	errors: number
	total_cost_usd: number
	cells: number
}

export interface LayoutFix {
	code: string
	action: string
	locale_code: string
	format_id: string
}

export interface RepairResponse {
	layout_fixes: LayoutFix[]
	needs_regeneration: boolean
	candidates: Draft[]
}

export interface TypographyCheckItem {
	locale_code: string
	format_id: string
	text: string
	font_path: string
	font_size_px: number
	line_height_px: number
	box_width_px: number
	box_px?: [number, number, number, number] | null
	text_rgb?: [number, number, number]
	large_text?: boolean
}

const DEFAULT_BASE_URL = 'http://localhost:8000'

export function baseUrl(): string {
	return import.meta.env.PUBLIC_API_BASE_URL ?? DEFAULT_BASE_URL
}

export class ApiError extends Error {
	status: number

	constructor(status: number, message: string) {
		super(message)
		this.status = status
	}
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${baseUrl()}${path}`, {
		...init,
		headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
	})
	if (!res.ok) {
		let detail = res.statusText
		try {
			const body = await res.json()
			detail = body.detail ?? detail
		} catch {
			// response wasn't JSON; keep statusText
		}
		throw new ApiError(res.status, `${res.status} ${path}: ${detail}`)
	}
	return res.json() as Promise<T>
}

export async function createCampaign(params: {
	brand: BrandSpec
	availableLocales: LocaleSpec[]
	availableFormats: FormatSpec[]
}): Promise<{ id: string }> {
	return request('/campaigns', {
		method: 'POST',
		body: JSON.stringify({
			brand: params.brand,
			available_locales: params.availableLocales,
			available_formats: params.availableFormats,
		}),
	})
}

export async function getCampaign(campaignId: string): Promise<CampaignSummary> {
	return request(`/campaigns/${campaignId}`)
}

export async function requestPlan(campaignId: string, intent: string): Promise<LocalizationPlan> {
	return request(`/campaigns/${campaignId}/plan`, {
		method: 'POST',
		body: JSON.stringify({ intent }),
	})
}

export async function triggerFanOut(
	campaignId: string,
	opts: { maxConcurrent?: number; ratePerMinute?: number | null; role?: string } = {},
): Promise<FanOutResponse> {
	return request(`/campaigns/${campaignId}/fan-out`, {
		method: 'POST',
		body: JSON.stringify({
			max_concurrent: opts.maxConcurrent ?? 10,
			rate_per_minute: opts.ratePerMinute ?? null,
			role: opts.role ?? 'scene',
		}),
	})
}

export async function critiqueVision(campaignId: string, cellKeys?: string[]): Promise<Finding[]> {
	return request(`/campaigns/${campaignId}/critique/vision`, {
		method: 'POST',
		body: JSON.stringify({ cell_keys: cellKeys ?? null }),
	})
}

export async function critiqueTypography(
	campaignId: string,
	items: TypographyCheckItem[],
): Promise<Finding[]> {
	return request(`/campaigns/${campaignId}/critique/typography`, {
		method: 'POST',
		body: JSON.stringify({ items }),
	})
}

export async function requestRepair(
	campaignId: string,
	params: { localeCode: string; formatId: string; repairNote?: string; variants?: number },
): Promise<RepairResponse> {
	return request(`/campaigns/${campaignId}/repair`, {
		method: 'POST',
		body: JSON.stringify({
			locale_code: params.localeCode,
			format_id: params.formatId,
			repair_note: params.repairNote ?? '',
			variants: params.variants ?? 3,
		}),
	})
}

export async function adoptRepair(
	campaignId: string,
	params: { localeCode: string; formatId: string; draftId: string },
): Promise<{ cell: string; active_draft: string }> {
	return request(`/campaigns/${campaignId}/repair/adopt`, {
		method: 'POST',
		body: JSON.stringify({
			locale_code: params.localeCode,
			format_id: params.formatId,
			draft_id: params.draftId,
		}),
	})
}

export function cellKey(localeCode: string, formatId: string): string {
	return `${localeCode}|${formatId}`
}

export function cellImageUrl(campaignId: string, localeCode: string, formatId: string): string {
	return `${baseUrl()}/campaigns/${campaignId}/cells/${encodeURIComponent(localeCode)}/${encodeURIComponent(formatId)}/image`
}

export function draftImageUrl(draftId: string): string {
	return `${baseUrl()}/drafts/${encodeURIComponent(draftId)}/image`
}

export function liveWebSocketUrl(campaignId: string): string {
	return `${baseUrl().replace(/^http/, 'ws')}/campaigns/${campaignId}/live`
}

export function liveSessionWebSocketUrl(projectId: string, role: 'camera' | 'control'): string {
	return `${baseUrl().replace(/^http/, 'ws')}/live/${encodeURIComponent(projectId)}/session?role=${role}`
}

export function liveFrameUrl(projectId: string, frameId: string): string {
	return `${baseUrl()}/live/${encodeURIComponent(projectId)}/frame/${encodeURIComponent(frameId)}`
}

export function syncWebSocketBaseUrl(): string {
	return `${baseUrl().replace(/^http/, 'ws')}/sync`
}
