import { useCallback, useState } from 'react'
import IconRail, { type RailView } from './studio/IconRail'
import MediaBin from './studio/MediaBin'
import PreviewPlayer from './studio/PreviewPlayer'
import Timeline from './studio/Timeline'
import DirectorChat from './studio/DirectorChat'
import StoryboardView from './studio/StoryboardView'
import ClipInspector from './studio/ClipInspector'
import Composer from './studio/Composer'
import MessageList from './studio/MessageList'
import { classifyIntent, agentReply } from './studio/agent'
import { colors, font } from './studio/theme'
import {
	DEFAULT_GENERATION_OPTIONS,
	emptyShot,
	timelineEndSec,
	FPS,
	type DirectorMessage,
	type GenerationOptions,
	type Shot,
} from './studio/types'
import {
	createShot,
	defaultShotSpec,
	generateClip,
	generateKeyframe,
	shotClipVideoUrl,
	shotKeyframeImageUrl,
	uploadAsset,
} from '../lib/shotsApi'

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
	const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
	const [inspectorShotId, setInspectorShotId] = useState<string | null>(null)
	const [hasUploaded, setHasUploaded] = useState(false)
	const [generationOptions, setGenerationOptions] = useState<GenerationOptions>(DEFAULT_GENERATION_OPTIONS)

	const activeShot = shots.find((s) => s.id === activeShotId) ?? null
	const inspectorShot = shots.find((s) => s.id === inspectorShotId) ?? null

	const addMessage = useCallback((role: DirectorMessage['role'], text: string) => {
		setMessages((prev) => [...prev, { id: `${role}-${Date.now()}-${Math.random()}`, role, text }])
	}, [])

	const patchShot = useCallback((id: string, patch: Partial<Shot>) => {
		setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
	}, [])

	const handleAddShot = useCallback(() => {
		setShots((prev) => {
			const shot = emptyShot(prev.length, { startSec: timelineEndSec(prev) })
			setActiveShotId(shot.id)
			return [...prev, shot]
		})
	}, [])

	const runKeyframeGeneration = useCallback(
		async (localId: string, label: string, spec: ReturnType<typeof defaultShotSpec>) => {
			const created = await createShot(projectId, spec)
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
						`Open it from the media bin to trim, filter, or animate it with Omni Flash.`,
				)
			}
		},
		[addMessage, patchShot, projectId],
	)

	const runClipGeneration = useCallback(
		async (shot: Shot) => {
			if (!shot.backendShotId) return
			setBusy(true)
			patchShot(shot.id, { status: 'generating_clip' })
			try {
				const clip = await generateClip(projectId, shot.backendShotId)
				if (clip.status === 'error') {
					patchShot(shot.id, { status: 'error' })
					addMessage('director', `Couldn't animate "${shot.label}": ${clip.error}`)
				} else {
					patchShot(shot.id, {
						status: 'clip_ready',
						clipUrl: shot.backendShotId ? shotClipVideoUrl(projectId, shot.backendShotId) : null,
					})
					addMessage('director', `Clip ${clip.status} for "${shot.label}" ($${clip.cost_usd.toFixed(4)}).`)
				}
			} catch (err) {
				patchShot(shot.id, { status: 'error' })
				addMessage('director', err instanceof Error ? `Something went wrong: ${err.message}` : 'Something went wrong.')
			} finally {
				setBusy(false)
			}
		},
		[addMessage, patchShot, projectId],
	)

	const handleSend = useCallback(
		async (text: string) => {
			addMessage('user', text)

			if ((!activeShot || activeShot.status === 'empty') && classifyIntent(text) === 'chat') {
				addMessage('director', agentReply(text))
				return
			}

			setBusy(true)

			try {
				if (!activeShot || activeShot.status === 'empty') {
					const label = text.slice(0, 40)
					const localId = activeShot?.id ?? emptyShot(shots.length).id

					const spec = {
						...defaultShotSpec(text),
						camera_movement: generationOptions.cameraMovement,
						aspect_ratio: generationOptions.aspectRatio,
						duration_sec: generationOptions.durationSec,
					}

					setShots((prev) => {
						const draft: Shot = {
							...(activeShot ?? emptyShot(prev.length)),
							id: localId,
							label,
							status: 'generating_keyframe',
							cameraMovement: generationOptions.cameraMovement,
							aspectRatio: generationOptions.aspectRatio,
							durationSec: generationOptions.durationSec,
							startSec: activeShot?.startSec ?? timelineEndSec(prev),
							trimStartSec: 0,
							trimEndSec: generationOptions.durationSec,
						}
						return prev.some((s) => s.id === localId)
							? prev.map((s) => (s.id === localId ? draft : s))
							: [...prev, draft]
					})
					setActiveShotId(localId)

					await runKeyframeGeneration(localId, label, spec)
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

				if (generationOptions.target === 'clip' && activeShot.keyframeUrl) {
					addMessage('director', `Animating "${activeShot.label}" with Omni Flash — noted: "${text}".`)
					await runClipGeneration(activeShot)
					patchShot(activeShot.id, { turnsUsed: activeShot.turnsUsed + 1 })
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
		[activeShot, addMessage, generationOptions, patchShot, projectId, runClipGeneration, runKeyframeGeneration, shots.length],
	)

	const handleUpload = useCallback(
		async (file: File) => {
			setBusy(true)
			setHasUploaded(true)
			try {
				const asset = await uploadAsset(projectId, file)
				addMessage('director', `Uploaded "${asset.filename}" — I can use it as a reference for the next shot.`)
			} catch (err) {
				addMessage('director', err instanceof Error ? `Upload failed: ${err.message}` : 'Upload failed.')
			} finally {
				setBusy(false)
			}
		},
		[addMessage, projectId],
	)

	const handleOpenInspector = useCallback((shotId: string) => {
		setInspectorShotId(shotId)
	}, [])

	const handleRegenerateKeyframe = useCallback(async () => {
		if (!inspectorShot) return
		setBusy(true)
		patchShot(inspectorShot.id, { status: 'generating_keyframe' })
		try {
			const spec = {
				...defaultShotSpec(inspectorShot.label),
				camera_movement: inspectorShot.cameraMovement,
				aspect_ratio: inspectorShot.aspectRatio,
				duration_sec: inspectorShot.durationSec,
			}
			await runKeyframeGeneration(inspectorShot.id, inspectorShot.label, spec)
		} finally {
			setBusy(false)
		}
	}, [inspectorShot, patchShot, runKeyframeGeneration])

	const handleGenerateClipFromInspector = useCallback(() => {
		if (inspectorShot) runClipGeneration(inspectorShot)
	}, [inspectorShot, runClipGeneration])

	const handleStepBack = useCallback(() => setCurrentTimeSec((t) => Math.max(0, t - 1 / FPS)), [])
	const handleStepForward = useCallback(() => setCurrentTimeSec((t) => t + 1 / FPS), [])
	const handleTogglePlay = useCallback(() => setPlaying((p) => !p), [])

	const started = shots.length > 0 || hasUploaded
	const conversing = messages.length > 1

	if (!started) {
		return (
			<div style={{ position: 'fixed', inset: 0, background: colors.surface0, display: 'flex', color: colors.text }}>
				<IconRail active={railView} onSelect={setRailView} />
				<div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24, minWidth: 0 }}>
					<div style={{ width: '100%', maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 20 }}>
						{conversing ? (
							<MessageList
								messages={messages}
								busy={busy}
								style={{ maxHeight: '48vh', overflowY: 'auto', paddingRight: 4 }}
							/>
						) : (
							<div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 8 }}>
								<span
									style={{
										fontSize: 10.5,
										letterSpacing: '0.22em',
										textTransform: 'uppercase',
										color: colors.textFaint,
										fontFamily: font.mono,
									}}
								>
									AI Director
								</span>
								<h1 style={{ margin: 0, fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em', color: colors.text }}>
									What do you want to create?
								</h1>
								<p style={{ margin: 0, fontSize: 14, color: colors.textDim, lineHeight: 1.5 }}>
									Describe a shot to generate a keyframe, or upload a reference to get started.
								</p>
							</div>
						)}
						<Composer
							variant="hero"
							busy={busy}
							options={generationOptions}
							onOptionsChange={setGenerationOptions}
							onSend={handleSend}
							onUpload={handleUpload}
						/>
					</div>
				</div>
			</div>
		)
	}

	return (
		<div style={{ position: 'fixed', inset: 0, background: colors.surface0, display: 'flex', color: colors.text }}>
			<IconRail active={railView} onSelect={setRailView} />

			{railView === 'media' && (
				<MediaBin
					shots={shots}
					activeShotId={activeShotId}
					collapsed={sidebarCollapsed}
					onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
					onSelect={setActiveShotId}
					onOpenInspector={handleOpenInspector}
					onAddShot={handleAddShot}
					onUpload={handleUpload}
				/>
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
					onOpenInspector={handleOpenInspector}
					onPatchShot={patchShot}
					onTogglePlay={handleTogglePlay}
					onStepBack={handleStepBack}
					onStepForward={handleStepForward}
				/>
			</div>

			<DirectorChat
				messages={messages}
				activeShot={activeShot}
				busy={busy}
				options={generationOptions}
				onOptionsChange={setGenerationOptions}
				onSend={handleSend}
				onUpload={handleUpload}
			/>

			{inspectorShot && (
				<ClipInspector
					shot={inspectorShot}
					busy={busy}
					onClose={() => setInspectorShotId(null)}
					onPatch={(patch) => patchShot(inspectorShot.id, patch)}
					onRegenerateKeyframe={handleRegenerateKeyframe}
					onGenerateClip={handleGenerateClipFromInspector}
				/>
			)}
		</div>
	)
}
