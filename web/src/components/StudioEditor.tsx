import { useCallback, useState } from 'react'
import IconRail, { type RailView } from './studio/IconRail'
import MediaBin from './studio/MediaBin'
import PreviewPlayer from './studio/PreviewPlayer'
import Timeline from './studio/Timeline'
import DirectorChat from './studio/DirectorChat'
import StoryboardView from './studio/StoryboardView'
import { emptyShot, type DirectorMessage, type Shot } from './studio/types'
import { createShot, defaultShotSpec, generateKeyframe, shotKeyframeImageUrl } from '../lib/shotsApi'

interface StudioEditorProps {
	projectId: string
}

const OPENING_MESSAGE: DirectorMessage = {
	id: 'opening',
	role: 'director',
	text: "Hi! I'm your AI director. Describe a shot and I'll generate a keyframe with Nano Banana 2 Lite — approve it before I animate it.",
}

export default function StudioEditor({ projectId }: StudioEditorProps) {
	const [railView, setRailView] = useState<RailView>('media')
	const [shots, setShots] = useState<Shot[]>([])
	const [activeShotId, setActiveShotId] = useState<string | null>(null)
	const [messages, setMessages] = useState<DirectorMessage[]>([OPENING_MESSAGE])
	const [busy, setBusy] = useState(false)
	const [currentTimeSec, setCurrentTimeSec] = useState(0)
	const [playing, setPlaying] = useState(false)

	const activeShot = shots.find((s) => s.id === activeShotId) ?? null

	const addMessage = useCallback((role: DirectorMessage['role'], text: string) => {
		setMessages((prev) => [...prev, { id: `${role}-${Date.now()}-${Math.random()}`, role, text }])
	}, [])

	const patchShot = useCallback((id: string, patch: Partial<Shot>) => {
		setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
	}, [])

	const handleAddShot = useCallback(() => {
		setShots((prev) => {
			const shot = emptyShot(prev.length)
			setActiveShotId(shot.id)
			return [...prev, shot]
		})
	}, [])

	const handleSend = useCallback(
		async (text: string) => {
			addMessage('user', text)
			setBusy(true)

			try {
				if (!activeShot || activeShot.status === 'empty') {
					const label = text.slice(0, 40)
					const localId = activeShot?.id ?? emptyShot(shots.length).id

					setShots((prev) => {
						const draft: Shot = {
							...(activeShot ?? emptyShot(prev.length)),
							id: localId,
							label,
							status: 'generating_keyframe',
						}
						return prev.some((s) => s.id === localId)
							? prev.map((s) => (s.id === localId ? draft : s))
							: [...prev, draft]
					})
					setActiveShotId(localId)

					const created = await createShot(projectId, defaultShotSpec(text))
					const keyframe = await generateKeyframe(projectId, created.shot_id)

					if (keyframe.status === 'error') {
						patchShot(localId, { status: 'error', backendShotId: created.shot_id })
						addMessage('director', `Couldn't generate a keyframe for "${label}": ${keyframe.error}`)
					} else {
						patchShot(localId, {
							status: 'keyframe_ready',
							backendShotId: created.shot_id,
							keyframeUrl: shotKeyframeImageUrl(projectId, created.shot_id),
						})
						addMessage(
							'director',
							`Keyframe ${keyframe.status} for "${label}" ($${keyframe.cost_usd.toFixed(4)}). ` +
								`Approve it in the storyboard — animating it with Omni Flash is Phase 2, not wired up yet.`,
						)
					}
					return
				}

				if (activeShot.turnsUsed >= activeShot.maxTurns) {
					addMessage(
						'director',
						`${activeShot.label} has used all ${activeShot.maxTurns} conversational edits Omni Flash ` +
							`allows on one interaction chain. I'd start a fresh take from the current clip rather than push a 4th edit.`,
					)
					return
				}

				addMessage(
					'director',
					`Noted for ${activeShot.label}: "${text}". Turn ${activeShot.turnsUsed + 1} of ` +
						`${activeShot.maxTurns} — this is where the edit chains via previous_interaction_id once Omni Flash is wired in.`,
				)
				patchShot(activeShot.id, { turnsUsed: activeShot.turnsUsed + 1, status: 'editing' })
			} catch (err) {
				addMessage('director', err instanceof Error ? `Something went wrong: ${err.message}` : 'Something went wrong.')
			} finally {
				setBusy(false)
			}
		},
		[activeShot, addMessage, patchShot, projectId, shots.length],
	)

	const handleStepBack = useCallback(() => setCurrentTimeSec((t) => Math.max(0, t - 1)), [])
	const handleStepForward = useCallback(() => setCurrentTimeSec((t) => t + 1), [])
	const handleTogglePlay = useCallback(() => setPlaying((p) => !p), [])

	return (
		<div style={{ position: 'fixed', inset: 0, background: '#0B0D10', display: 'flex', color: '#E6E9EC' }}>
			<IconRail active={railView} onSelect={setRailView} />

			{railView === 'media' && (
				<div style={{ width: 260, borderRight: '1px solid #2C3238', overflowY: 'auto' }}>
					<MediaBin shots={shots} activeShotId={activeShotId} onSelect={setActiveShotId} onAddShot={handleAddShot} />
				</div>
			)}

			<div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
				{railView === 'storyboard' ? (
					<StoryboardView shot={activeShot} projectId={projectId} />
				) : (
					<PreviewPlayer shot={activeShot} onGenerateKeyframe={handleAddShot} />
				)}

				<Timeline
					shots={shots}
					currentTimeSec={currentTimeSec}
					playing={playing}
					activeShotId={activeShotId}
					onSeek={setCurrentTimeSec}
					onSelectShot={setActiveShotId}
					onTogglePlay={handleTogglePlay}
					onStepBack={handleStepBack}
					onStepForward={handleStepForward}
				/>
			</div>

			<DirectorChat messages={messages} activeShot={activeShot} busy={busy} onSend={handleSend} />
		</div>
	)
}
