import type { CameraMovement } from '../../lib/shotsApi'

export type ShotStatus =
	| 'empty'
	| 'generating_keyframe'
	| 'keyframe_ready'
	| 'generating_clip'
	| 'clip_ready'
	| 'editing'
	| 'error'

export interface ShotFilters {
	brightness: number
	contrast: number
	saturation: number
	hue: number
}

export const DEFAULT_FILTERS: ShotFilters = {
	brightness: 100,
	contrast: 100,
	saturation: 100,
	hue: 0,
}

export function filtersToCss(filters: ShotFilters): string {
	return (
		`brightness(${filters.brightness}%) contrast(${filters.contrast}%) ` +
		`saturate(${filters.saturation}%) hue-rotate(${filters.hue}deg)`
	)
}

export interface Shot {
	id: string
	backendShotId: string | null
	index: number
	label: string
	durationSec: number
	startSec: number
	trimStartSec: number
	trimEndSec: number
	cameraMovement: CameraMovement
	aspectRatio: string
	filters: ShotFilters
	keyframeUrl: string | null
	clipUrl: string | null
	status: ShotStatus
	turnsUsed: number
	maxTurns: number
}

export interface DirectorMessage {
	id: string
	role: 'director' | 'user'
	text: string
}

export const ASPECT_RATIOS = [
	'1:1',
	'3:2',
	'2:3',
	'3:4',
	'4:3',
	'4:5',
	'5:4',
	'9:16',
	'16:9',
	'21:9',
] as const

export const CAMERA_MOVEMENTS: CameraMovement[] = [
	'static',
	'pan_left',
	'pan_right',
	'tilt_up',
	'tilt_down',
	'zoom_in',
	'zoom_out',
	'tracking',
	'handheld',
]

export const MODEL_TARGETS = ['keyframe', 'clip'] as const
export type ModelTarget = (typeof MODEL_TARGETS)[number]

export const MODEL_TARGET_LABEL: Record<ModelTarget, string> = {
	keyframe: 'Nano Banana 2 Lite — keyframe',
	clip: 'Omni Flash — animate clip',
}

export interface GenerationOptions {
	target: ModelTarget
	aspectRatio: string
	cameraMovement: CameraMovement
	durationSec: number
}

export const DEFAULT_GENERATION_OPTIONS: GenerationOptions = {
	target: 'keyframe',
	aspectRatio: '16:9',
	cameraMovement: 'static',
	durationSec: 6,
}

export function emptyShot(index: number, overrides: Partial<Shot> = {}): Shot {
	const durationSec = overrides.durationSec ?? 10
	return {
		id: `shot-${index}-${Date.now()}`,
		backendShotId: null,
		index,
		label: `Shot ${index + 1}`,
		durationSec,
		startSec: overrides.startSec ?? 0,
		trimStartSec: 0,
		trimEndSec: durationSec,
		cameraMovement: 'static',
		aspectRatio: '16:9',
		filters: { ...DEFAULT_FILTERS },
		keyframeUrl: null,
		clipUrl: null,
		status: 'empty',
		turnsUsed: 0,
		maxTurns: 3,
		...overrides,
	}
}

export const FPS = 30

export function shotSpanSec(shot: Shot): number {
	return Math.max(shot.trimEndSec - shot.trimStartSec, 0.1)
}

export function timelineEndSec(shots: Shot[]): number {
	return shots.reduce((max, s) => Math.max(max, s.startSec + shotSpanSec(s)), 0)
}

export function totalDurationSec(shots: Shot[]): number {
	return shots.reduce((sum, s) => sum + (s.trimEndSec - s.trimStartSec), 0)
}

export function snapToFrame(sec: number): number {
	return Math.round(sec * FPS) / FPS
}

export function formatTimecode(totalSeconds: number): string {
	const m = Math.floor(totalSeconds / 60)
	const s = Math.floor(totalSeconds % 60)
	return `${m}:${String(s).padStart(2, '0')}`
}

export function formatTimecodeFrames(totalSeconds: number): string {
	const safe = Math.max(0, totalSeconds)
	const m = Math.floor(safe / 60)
	const s = Math.floor(safe % 60)
	const f = Math.round((safe - Math.floor(safe)) * FPS)
	return `${m}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`
}
