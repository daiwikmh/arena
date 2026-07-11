import { ApiError, baseUrl, request } from './api'

export type CameraMovement =
	| 'static'
	| 'pan_left'
	| 'pan_right'
	| 'tilt_up'
	| 'tilt_down'
	| 'zoom_in'
	| 'zoom_out'
	| 'tracking'
	| 'handheld'

export interface ShotObjectRef {
	asset_id: string
	label: string
}

export interface ShotSpec {
	subject: string
	setting: string
	action: string
	camera_movement: CameraMovement
	time_of_day: 'dawn' | 'day' | 'dusk' | 'night'
	palette: string[]
	mood: string
	lighting: 'soft' | 'hard' | 'backlit' | 'diffused' | 'golden-hour'
	duration_sec: number
	aspect_ratio: string
	excludes: string[]
	object_refs: ShotObjectRef[]
}

export interface ShotSummary {
	id: string
	spec: ShotSpec
	has_keyframe: boolean
	draft_id: string | null
	has_clip: boolean
	clip_draft_id: string | null
}

export interface AssetSummary {
	id: string
	filename: string
	mime_type: string
	url: string
}

export interface ProjectSummary {
	id: string
	shot_ids: string[]
	shots: ShotSummary[]
	assets: AssetSummary[]
}

export interface CreateShotResponse {
	shot_id: string
	spec: ShotSpec
}

export interface KeyframeResponse {
	shot_id: string
	status: 'generated' | 'cached' | 'error'
	draft_id: string | null
	error: string | null
	cost_usd: number
}

export interface ClipResponse {
	shot_id: string
	status: 'generated' | 'cached' | 'error'
	draft_id: string | null
	error: string | null
	cost_usd: number
	delivery: 'bytes' | 'uri' | 'none'
	video_uri: string | null
}

export function defaultShotSpec(text: string): ShotSpec {
	return {
		subject: text,
		setting: '',
		action: text,
		camera_movement: 'static',
		time_of_day: 'day',
		palette: ['#14171C', '#00A3C4'],
		mood: '',
		lighting: 'soft',
		duration_sec: 6,
		aspect_ratio: '16:9',
		excludes: [],
		object_refs: [],
	}
}

export async function getProject(projectId: string): Promise<ProjectSummary> {
	return request(`/projects/${projectId}`)
}

export async function createShot(projectId: string, spec: ShotSpec): Promise<CreateShotResponse> {
	return request(`/projects/${projectId}/shots`, {
		method: 'POST',
		body: JSON.stringify(spec),
	})
}

export async function generateKeyframe(projectId: string, shotId: string): Promise<KeyframeResponse> {
	return request(`/projects/${projectId}/shots/${shotId}/keyframe`, { method: 'POST' })
}

export function shotKeyframeImageUrl(projectId: string, shotId: string): string {
	return `${baseUrl()}/projects/${projectId}/shots/${shotId}/keyframe/image`
}

export async function generateClip(projectId: string, shotId: string): Promise<ClipResponse> {
	return request(`/projects/${projectId}/shots/${shotId}/clip`, { method: 'POST' })
}

export function shotClipVideoUrl(projectId: string, shotId: string): string {
	return `${baseUrl()}/projects/${projectId}/shots/${shotId}/clip/video`
}

export async function uploadAsset(projectId: string, file: File): Promise<AssetSummary> {
	const form = new FormData()
	form.append('file', file)
	const res = await fetch(`${baseUrl()}/projects/${projectId}/assets`, {
		method: 'POST',
		body: form,
	})
	if (!res.ok) {
		let detail = res.statusText
		try {
			const body = await res.json()
			detail = body.detail ?? detail
		} catch {
			// response wasn't JSON; keep statusText
		}
		throw new ApiError(res.status, `${res.status} /projects/${projectId}/assets: ${detail}`)
	}
	const body: { asset: AssetSummary } = await res.json()
	return body.asset
}
