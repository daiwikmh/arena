export type ShotStatus =
	| 'empty'
	| 'generating_keyframe'
	| 'keyframe_ready'
	| 'generating_clip'
	| 'clip_ready'
	| 'editing'
	| 'error'

export interface Shot {
	id: string
	backendShotId: string | null
	index: number
	label: string
	durationSec: number
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

export function emptyShot(index: number): Shot {
	return {
		id: `shot-${index}-${Date.now()}`,
		backendShotId: null,
		index,
		label: `Shot ${index + 1}`,
		durationSec: 10,
		keyframeUrl: null,
		clipUrl: null,
		status: 'empty',
		turnsUsed: 0,
		maxTurns: 3,
	}
}

export function totalDurationSec(shots: Shot[]): number {
	return shots.reduce((sum, s) => sum + s.durationSec, 0)
}

export function formatTimecode(totalSeconds: number): string {
	const m = Math.floor(totalSeconds / 60)
	const s = Math.floor(totalSeconds % 60)
	return `${m}:${String(s).padStart(2, '0')}`
}
