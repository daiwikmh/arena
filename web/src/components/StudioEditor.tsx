import { useCallback, useState } from 'react'
import IconRail, { type RailView } from './studio/IconRail'
import MediaBin from './studio/MediaBin'
import PreviewPlayer from './studio/PreviewPlayer'
import Timeline from './studio/Timeline'
import DirectorChat from './studio/DirectorChat'
import StoryboardView from './studio/StoryboardView'
import { emptyShot, type DirectorMessage, type Shot } from './studio/types'

interface StudioEditorProps {
	projectId: string
}

const OPENING_MESSAGE: DirectorMessage = {
	id: 'opening',
	role: 'director',
	text: "Hi! I'm your AI director. Describe a shot and I'll add it to the timeline — approve a keyframe before I animate it.",
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

	const handleAddShot = useCallback(() => {
		setShots((prev) => {
			const shot = emptyShot(prev.length)
			setActiveShotId(shot.id)
			return [...prev, shot]
		})
	}, [])

	const handleSend = useCallback(
		(text: string) => {
			addMessage('user', text)
			setBusy(true)

			setTimeout(() => {
				setShots((prev) => {
					if (!activeShot || activeShot.status === 'empty') {
						const shot: Shot = { ...emptyShot(prev.length), label: text.slice(0, 40) }
						setActiveShotId(shot.id)
						addMessage(
							'director',
							`Added "${shot.label}" to the timeline. This build doesn't call NB2 Lite yet — ` +
								`approving a keyframe here is where that generation call plugs in.`,
						)
						return [...prev, shot]
					}

					if (activeShot.turnsUsed >= activeShot.maxTurns) {
						addMessage(
							'director',
							`${activeShot.label} has used all ${activeShot.maxTurns} conversational edits Omni Flash ` +
								`allows on one interaction chain. I'd start a fresh take from the current clip rather than push a 4th edit.`,
						)
						return prev
					}

					addMessage(
						'director',
						`Noted for ${activeShot.label}: "${text}". Turn ${activeShot.turnsUsed + 1} of ` +
							`${activeShot.maxTurns} — this is where the edit would chain via previous_interaction_id.`,
					)
					return prev.map((s) =>
						s.id === activeShot.id ? { ...s, turnsUsed: s.turnsUsed + 1, status: 'editing' as const } : s,
					)
				})
				setBusy(false)
			}, 500)
		},
		[activeShot, addMessage],
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
