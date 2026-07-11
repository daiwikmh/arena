import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CanvasRevealEffect } from './ui/canvas-reveal-effect'
import {
	Sparkles,
	MessageSquare,
	Video,
	Mic,
	Palette,
	Box,
	Grid,
	Settings,
	ChevronRight,
	Plus,
	Search,
	Code,
	Tv,
	Layers,
	Bell,
	Settings2,
	Download,
	FileText
} from 'lucide-react'
import LeftSidebar from './studio/LeftSidebar'
import { type RailView } from './studio/IconRail'
import SidebarPanels from './studio/SidebarPanels'
import PreviewPlayer from './studio/PreviewPlayer'
import Timeline from './studio/Timeline'
import DirectorChat from './studio/DirectorChat'
import StoryboardView from './studio/StoryboardView'
import ClipInspector from './studio/ClipInspector'
import Composer from './studio/Composer'
import MessageList from './studio/MessageList'
import { classifyIntent, agentReply, detectModel } from './studio/agent'
import { colors, font, radius, shadow } from './studio/theme'
import { baseUrl } from '../lib/api'
import {
	DEFAULT_GENERATION_OPTIONS,
	emptyShot,
	snapToFrame,
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
	getProject,
	shotClipVideoUrl,
	shotKeyframeImageUrl,
	uploadAsset,
	type AssetSummary,
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
	const [editorStarted, setEditorStarted] = useState(false)
	const [landingSearchText, setLandingSearchText] = useState('')
	const [generationOptions, setGenerationOptions] = useState<GenerationOptions>(DEFAULT_GENERATION_OPTIONS)
	const [spaceCardHovered, setSpaceCardHovered] = useState(false)
	const [viewingLanding, setViewingLanding] = useState(false)
	const [assets, setAssets] = useState<AssetSummary[]>([])
	const [attachedAssetIds, setAttachedAssetIds] = useState<string[]>([])

	useEffect(() => {
		getProject(projectId)
			.then((project) => setAssets(project.assets))
			.catch(() => {})
	}, [projectId])

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

	const handleAddShotFromAsset = useCallback((asset: AssetSummary) => {
		setShots((prev) => {
			const label = asset.filename.slice(0, 40)
			const localId = `shot-${prev.length}-${Date.now()}`
			const fullUrl = asset.url.startsWith('http') ? asset.url : `${baseUrl()}${asset.url}`
			const shot: Shot = {
				...emptyShot(prev.length, { startSec: timelineEndSec(prev) }),
				id: localId,
				label,
				status: 'keyframe_ready',
				keyframeUrl: fullUrl,
				backendShotId: asset.id
			}
			setActiveShotId(localId)
			addMessage('director', `I've imported your reference "${asset.filename}" as ${shot.label}! Click "Animate Clip" to bring it to life with Omni Flash.`)
			return [...prev, shot]
		})
	}, [addMessage])

	const handleDeleteShot = useCallback(
		(shotId: string) => {
			setShots((prev) => prev.filter((s) => s.id !== shotId))
			setActiveShotId((prev) => (prev === shotId ? null : prev))
			setInspectorShotId((prev) => (prev === shotId ? null : prev))
		},
		[],
	)

	const handleDuplicateShot = useCallback((shotId: string) => {
		setShots((prev) => {
			const source = prev.find((s) => s.id === shotId)
			if (!source) return prev
			const copy: Shot = {
				...source,
				id: `shot-${prev.length}-${Date.now()}`,
				label: `${source.label} copy`,
				startSec: snapToFrame(timelineEndSec(prev)),
			}
			setActiveShotId(copy.id)
			return [...prev, copy]
		})
	}, [])

	const handleSplitShot = useCallback(
		(shotId: string, atSec: number) => {
			setShots((prev) => {
				const source = prev.find((s) => s.id === shotId)
				if (!source) return prev
				const splitTrim = snapToFrame(source.trimStartSec + (atSec - source.startSec))
				if (splitTrim <= source.trimStartSec + 1 / FPS || splitTrim >= source.trimEndSec - 1 / FPS) return prev

				const left: Shot = { ...source, trimEndSec: splitTrim }
				const right: Shot = {
					...source,
					id: `shot-${prev.length}-${Date.now()}`,
					label: `${source.label} (2)`,
					trimStartSec: splitTrim,
					startSec: snapToFrame(atSec),
					turnsUsed: 0,
				}
				setActiveShotId(right.id)
				return prev.flatMap((s) => (s.id === shotId ? [left, right] : [s]))
			})
		},
		[],
	)

	const runKeyframeGeneration = useCallback(
		async (
			localId: string,
			label: string,
			spec: ReturnType<typeof defaultShotSpec>,
		): Promise<{ backendShotId: string; ok: boolean }> => {
			const created = await createShot(projectId, spec)
			const keyframe = await generateKeyframe(projectId, created.shot_id)

			if (keyframe.status === 'error') {
				patchShot(localId, { status: 'error', backendShotId: created.shot_id })
				addMessage('director', `Couldn't generate a keyframe for "${label}": ${keyframe.error}`)
				return { backendShotId: created.shot_id, ok: false }
			}

			patchShot(localId, {
				status: 'keyframe_ready',
				backendShotId: created.shot_id,
				keyframeUrl: shotKeyframeImageUrl(projectId, created.shot_id),
			})
			addMessage(
				'director',
				`Keyframe ${keyframe.status} for "${label}" with Nano Banana 2 Lite ($${keyframe.cost_usd.toFixed(4)}). ` +
					`Open it from the media bin to trim, filter, or animate it with Omni Flash.`,
			)
			return { backendShotId: created.shot_id, ok: true }
		},
		[addMessage, patchShot, projectId],
	)

	const animateClip = useCallback(
		async (localId: string, backendShotId: string, label: string) => {
			setBusy(true)
			patchShot(localId, { status: 'generating_clip' })
			try {
				const clip = await generateClip(projectId, backendShotId)
				if (clip.status === 'error') {
					patchShot(localId, { status: 'error' })
					addMessage('director', `Couldn't animate "${label}": ${clip.error}`)
				} else {
					patchShot(localId, {
						status: 'clip_ready',
						clipUrl: shotClipVideoUrl(projectId, backendShotId),
					})
					addMessage('director', `Clip ${clip.status} for "${label}" with Omni Flash ($${clip.cost_usd.toFixed(4)}).`)
				}
			} catch (err) {
				patchShot(localId, { status: 'error' })
				addMessage('director', err instanceof Error ? `Something went wrong: ${err.message}` : 'Something went wrong.')
			} finally {
				setBusy(false)
			}
		},
		[addMessage, patchShot, projectId],
	)

	const runClipGeneration = useCallback(
		async (shot: Shot) => {
			if (!shot.backendShotId) return
			await animateClip(shot.id, shot.backendShotId, shot.label)
		},
		[animateClip],
	)

	const handleSend = useCallback(
		async (text: string) => {
			addMessage('user', text)
			setEditorStarted(true); setViewingLanding(false)

			if ((!activeShot || activeShot.status === 'empty') && classifyIntent(text) === 'chat') {
				addMessage('director', agentReply(text))
				return
			}

			const model = detectModel(text) ?? generationOptions.target
			if (detectModel(text) && model !== generationOptions.target) {
				setGenerationOptions((o) => ({ ...o, target: model }))
			}

			setBusy(true)

			try {
				if (!activeShot || activeShot.status === 'empty') {
					const label = text.slice(0, 40)
					const localId = activeShot?.id ?? emptyShot(shots.length).id

					const attachedAssets = assets.filter((a) => attachedAssetIds.includes(a.id))
					const spec = {
						...defaultShotSpec(text),
						camera_movement: generationOptions.cameraMovement,
						aspect_ratio: generationOptions.aspectRatio,
						duration_sec: generationOptions.durationSec,
						object_refs: attachedAssets.map((a) => ({ asset_id: a.id, label: a.filename })),
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

					const { backendShotId, ok } = await runKeyframeGeneration(localId, label, spec)

					if (ok && model === 'clip') {
						addMessage('director', `You asked for motion — switching from Nano Banana 2 Lite to Omni Flash to animate "${label}".`)
						await animateClip(localId, backendShotId, label)
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

				if (model === 'clip' && activeShot.keyframeUrl) {
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
		[activeShot, addMessage, animateClip, assets, attachedAssetIds, generationOptions, patchShot, runClipGeneration, runKeyframeGeneration, shots.length],
	)

	const handleUpload = useCallback(
		async (file: File) => {
			setBusy(true)
			setHasUploaded(true)
			setEditorStarted(true); setViewingLanding(false)
			try {
				const asset = await uploadAsset(projectId, file)
				setAssets((prev) => (prev.some((a) => a.id === asset.id) ? prev : [...prev, asset]))
				setAttachedAssetIds((prev) => (prev.includes(asset.id) ? prev : [...prev, asset.id]))
				addMessage('director', `Uploaded "${asset.filename}" — attached it as a reference for the next shot. Toggle it off in the media bin if you don't want it used.`)
			} catch (err) {
				addMessage('director', err instanceof Error ? `Upload failed: ${err.message}` : 'Upload failed.')
			} finally {
				setBusy(false)
			}
		},
		[addMessage, projectId],
	)

	const toggleAssetAttachment = useCallback((assetId: string) => {
		setAttachedAssetIds((prev) =>
			prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId],
		)
	}, [])

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

	const started = shots.length > 0 || hasUploaded || editorStarted
	const conversing = messages.length > 1

	const promoBannerStyle: CSSProperties = {
		display: 'flex',
		alignItems: 'center',
		background: colors.surface2,
		border: `1px solid ${colors.border}`,
		borderRadius: 20,
		padding: '2px 4px 2px 8px',
		height: 32,
	}

	const promoBadgeStyle: CSSProperties = {
		background: colors.accent,
		color: colors.accentText,
		fontSize: 8.5,
		fontWeight: 800,
		borderRadius: radius.sm,
		padding: '2px 6px',
		marginRight: 8,
	}

	const promoBtnStyle: CSSProperties = {
		background: colors.white,
		color: colors.black,
		fontSize: 10,
		fontWeight: 700,
		border: 0,
		borderRadius: radius.sm,
		padding: '2px 8px',
		height: 24,
		cursor: 'pointer',
	}

	const headerIconBtnStyle: CSSProperties = {
		display: 'flex',
		alignItems: 'center',
		background: colors.surface2,
		border: `1px solid ${colors.borderStrong}`,
		borderRadius: radius.md,
		padding: '0 10px',
		height: 28,
		fontSize: 11,
		fontWeight: 600,
		color: colors.text,
		cursor: 'pointer',
	}

	const circleHeaderIconBtnStyle: CSSProperties = {
		width: 28,
		height: 28,
		borderRadius: radius.pill,
		background: colors.surface2,
		border: `1px solid ${colors.borderStrong}`,
		display: 'grid',
		placeItems: 'center',
		color: colors.textDim,
		cursor: 'pointer',
	}

	const avatarStyle: CSSProperties = {
		width: 28,
		height: 28,
		borderRadius: radius.pill,
		background: colors.surface3,
		border: `1px solid ${colors.borderStrong}`,
		display: 'grid',
		placeItems: 'center',
		color: colors.text,
	}

	const searchBarWrapperStyle: CSSProperties = {
		display: 'flex',
		alignItems: 'center',
		width: '100%',
		height: 48,
		borderRadius: 24,
		background: colors.surface2,
		border: `1px solid ${colors.borderStrong}`,
		boxShadow: shadow.glow,
	}

	const landingSearchInputStyle: CSSProperties = {
		flex: 1,
		height: '100%',
		background: 'transparent',
		border: 0,
		outline: 'none',
		color: colors.text,
		fontSize: 13.5,
		fontWeight: 500,
		padding: '0 14px',
	}

	const shortcutBadgeStyle: CSSProperties = {
		background: colors.surface3,
		color: colors.textFaint,
		fontSize: 9.5,
		fontWeight: 600,
		borderRadius: radius.sm,
		padding: '3px 8px',
		marginRight: 14,
		fontFamily: font.mono,
	}

	const categoryGridStyle: CSSProperties = {
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fill, minmax(68px, 1fr))',
		gap: 12,
		width: '100%',
		marginTop: 10,
	}

	const categoryTileStyle: CSSProperties = {
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		background: 'transparent',
		border: 0,
		cursor: 'pointer',
		gap: 6,
	}

	const tileIconWrapperStyle: CSSProperties = {
		width: 44,
		height: 44,
		borderRadius: radius.md,
		display: 'grid',
		placeItems: 'center',
		boxShadow: shadow.card,
		transition: 'transform 0.12s ease, border-color 0.12s ease',
	}

	const tileLabelStyle: CSSProperties = {
		fontSize: 10.5,
		fontWeight: 600,
		color: colors.textDim,
		transition: 'color 0.12s ease',
	}

	const brandBadgeStyle: CSSProperties = {
		width: 18,
		height: 18,
		borderRadius: radius.pill,
		display: 'grid',
		placeItems: 'center',
		color: '#FAFAFA',
		fontSize: 9,
		fontWeight: 800,
		boxShadow: shadow.card,
	}

	const brandBadgeLinkStyle: CSSProperties = {
		background: colors.surface2,
		border: `1px solid ${colors.borderStrong}`,
		borderRadius: radius.sm,
		padding: '2px 6px',
		fontSize: 9.5,
		fontWeight: 600,
		color: colors.textDim,
		cursor: 'pointer',
	}

	const dashboardCardStyle: CSSProperties = {
		flex: '1 1 280px',
		background: colors.surface2,
		border: `1px solid ${colors.borderStrong}`,
		borderRadius: radius.lg,
		padding: '16px 20px',
		boxShadow: shadow.card,
	}

	const addProjectBtnStyle: CSSProperties = {
		width: 22,
		height: 22,
		borderRadius: radius.sm,
		border: `1px solid ${colors.borderStrong}`,
		background: colors.surface3,
		color: colors.textDim,
		display: 'grid',
		placeItems: 'center',
		cursor: 'pointer',
	}

	const projectRowStyle: CSSProperties = {
		display: 'flex',
		alignItems: 'center',
		gap: 10,
		padding: '10px 12px',
		background: colors.surface1,
		border: `1px solid ${colors.border}`,
		borderRadius: radius.md,
		cursor: 'pointer',
		transition: 'background-color 0.1s ease',
	}

	const upgradeTagStyle: CSSProperties = {
		fontSize: 7.5,
		fontWeight: 800,
		color: colors.accent,
		background: colors.accentDim,
		padding: '1px 4px',
		borderRadius: radius.sm,
	}

	const sandboxCreateBtnStyle: CSSProperties = {
		padding: '5px 12px',
		fontSize: 11,
		fontWeight: 700,
		borderRadius: radius.md,
		background: colors.white,
		color: colors.black,
		border: 0,
		cursor: 'pointer',
		boxShadow: shadow.card,
	}

	if (!started || viewingLanding) {
		return (
			<div style={{ position: 'fixed', inset: 0, background: colors.surface0, display: 'flex', color: colors.text, fontFamily: font.sans }}>
				<LeftSidebar
					active={railView}
					onSelect={setRailView}
				/>
				
				<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: colors.surface0, padding: '20px 40px 40px' }}>
					
					{/* TOP HEADER BAR */}
					<header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 50, flexWrap: 'wrap', gap: 12 }}>
						{/* Promotion Banner */}
						<div style={promoBannerStyle}>
							<span style={promoBadgeStyle}>UNLIMITED</span>
							<span style={{ fontSize: 11, fontWeight: 600, color: colors.textDim, marginRight: 6 }}>
								Omni Flash 2.5 Pro. Unlimited clips for one month.
							</span>
							<button style={promoBtnStyle} onClick={() => alert('Upgrade to Pro to unlock unlimited 4K video renders!')}>Try it now</button>
						</div>

						{/* Customize & Profile Controls */}
						<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
							<span style={{ fontSize: 12, fontWeight: 700, color: colors.accent, cursor: 'pointer' }} onClick={() => alert('Interactive subscription tier!')}>Pricing</span>
							<button style={headerIconBtnStyle} title="Customize settings" onClick={() => alert('Customizing prompt hyperparameters...')}>
								<Settings size={14} style={{ marginRight: 6 }} />
								<span>Customize</span>
								<span style={{ width: 4, height: 4, borderRadius: 2, background: colors.accent, marginLeft: 6 }} />
							</button>
							<button style={circleHeaderIconBtnStyle} title="Notifications">
								<Bell size={13} />
							</button>
							<div style={avatarStyle}>
								<span style={{ fontSize: 10, fontWeight: 800 }}>U</span>
							</div>
						</div>
					</header>

					{/* GREETING HERO TITLE */}
					<div style={{ textAlign: 'center', marginBottom: 28 }}>
						<h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', color: colors.text }}>
							Good afternoon, start directing!
						</h1>
					</div>

					{/* SEARCH & CONVERSATION BAR */}
					<div style={{ maxWidth: 640, width: '100%', margin: '0 auto 36px', display: 'flex', flexDirection: 'column', gap: 16 }}>
						<div style={searchBarWrapperStyle}>
							<Search size={16} color={colors.textFaint} style={{ marginLeft: 14 }} />
							<input
								type="text"
								value={landingSearchText}
								onChange={(e) => setLandingSearchText(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' && landingSearchText.trim()) {
										handleSend(landingSearchText);
									}
								}}
								placeholder="Ask Arena or describe a shot prompt..."
								style={landingSearchInputStyle}
							/>
							<div style={shortcutBadgeStyle}>Enter ↵</div>
						</div>

						{/* Quick Categories Icons */}
						<div style={categoryGridStyle}>
							{[
								{ label: 'Spaces', icon: Layers, view: 'captions' as RailView },
								{ label: 'Image', icon: Sparkles, view: 'media' as RailView },
								{ label: 'Video', icon: Video, view: 'storyboard' as RailView },
								{ label: 'Audio', icon: Mic, view: 'music' as RailView },
								{ label: 'Design', icon: Palette, view: 'text' as RailView },
								{ label: '3D', icon: Box, view: 'storyboard' as RailView },
								{ label: 'Stock', icon: Grid, view: 'media' as RailView },
								{ label: 'All tools', icon: Settings, view: 'media' as RailView, accent: true },
							].map((item, idx) => (
								<button
									key={idx}
									onClick={() => {
										setRailView(item.view);
										setEditorStarted(true); setViewingLanding(false);
										if (item.label !== 'All tools') {
											setLandingSearchText(`Generating a dynamic ${item.label.toLowerCase()} scene...`);
										}
									}}
									onMouseEnter={(e) => {
										const icon = e.currentTarget.firstElementChild as HTMLElement
										icon.style.transform = 'translateY(-2px)'
										icon.style.borderColor = colors.accent
										const label = e.currentTarget.lastElementChild as HTMLElement
										label.style.color = colors.text
									}}
									onMouseLeave={(e) => {
										const icon = e.currentTarget.firstElementChild as HTMLElement
										icon.style.transform = 'translateY(0)'
										icon.style.borderColor = item.accent ? colors.accent : colors.borderStrong
										const label = e.currentTarget.lastElementChild as HTMLElement
										label.style.color = colors.textDim
									}}
									style={categoryTileStyle}
								>
									<div
										style={{
											...tileIconWrapperStyle,
											backgroundColor: item.accent ? colors.accentDim : colors.surface3,
											border: `1px solid ${item.accent ? colors.accent : colors.borderStrong}`,
										}}
									>
										<item.icon size={15} color={item.accent ? colors.accent : colors.textDim} />
									</div>
									<span style={tileLabelStyle}>{item.label}</span>
								</button>
							))}
						</div>
					</div>

					{/* INTEGRATIONS FAV BAR */}
					<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '0 auto 48px', flexWrap: 'wrap', maxWidth: 760 }}>
						<span style={{ fontSize: 11, color: colors.textFaint, fontWeight: 500 }}>
							Use Arena in your favorite tools:
						</span>
						<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
							{[
								{ name: 'Claude', url: 'https://anthropic.com', char: 'C', bg: '#D97706' },
								{ name: 'ChatGPT', url: 'https://openai.com', char: 'G', bg: '#059669' },
								{ name: 'VS Code', url: 'https://code.visualstudio.com', char: 'V', bg: '#2563EB' },
								{ name: 'Figma', url: 'https://figma.com', char: 'F', bg: '#EC4899' },
								{ name: 'Premiere', url: 'https://adobe.com', char: 'P', bg: '#7C3AED' },
								{ name: 'Resolve', url: 'https://blackmagicdesign.com', char: 'R', bg: '#DC2626' }
							].map((brand) => (
								<div key={brand.name} style={{ ...brandBadgeStyle, backgroundColor: brand.bg }} title={brand.name}>
									{brand.char}
								</div>
							))}
							<div style={brandBadgeLinkStyle}>API ↗</div>
							<div style={brandBadgeLinkStyle}>Plugins ↗</div>
						</div>
					</div>

					{/* DASHBOARD BOTTOM CARDS */}
					<div style={{ display: 'flex', gap: 20, maxWidth: 840, width: '100%', margin: '0 auto', flexWrap: 'wrap' }}>
						{/* CARD A: PROJECTS LIST */}
						<div style={dashboardCardStyle}>
							<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
								<span style={{ fontSize: 13, fontWeight: 700, color: colors.text }}>Projects</span>
								<button
									style={addProjectBtnStyle}
									onClick={() => {
										handleAddShot();
										setEditorStarted(true); setViewingLanding(false);
									}}
								>
									<Plus size={11} />
								</button>
							</div>

							<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
								<div
									style={projectRowStyle}
									onClick={() => {
										setEditorStarted(true); setViewingLanding(false);
										if (shots.length === 0) handleAddShot();
									}}
								>
									<div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#FBBF24' }} />
									<span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>Personal Workspace</span>
									<ChevronRight size={12} color={colors.textFaint} />
								</div>

								<div
									style={projectRowStyle}
									onClick={() => alert('Team projects are an Arena Pro tier feature. Upgrade to collaborate!')}
								>
									<div style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#A78BFA' }} />
									<span style={{ fontSize: 12, fontWeight: 500, flex: 1, color: colors.textDim }}>Team Studio</span>
									<span style={upgradeTagStyle}>UPGRADE</span>
								</div>
							</div>
						</div>

						{/* CARD B: GRAPHICS FLOW CANVAS */}
						<div
							onMouseEnter={() => setSpaceCardHovered(true)}
							onMouseLeave={() => setSpaceCardHovered(false)}
							style={{
								...dashboardCardStyle,
								flex: '1 1 400px',
								display: 'flex',
								flexDirection: 'column',
								alignItems: 'center',
								justifyContent: 'center',
								padding: '24px 30px',
								position: 'relative',
								overflow: 'hidden',
							}}
						>
							<AnimatePresence>
								{spaceCardHovered && (
									<motion.div
										initial={{ opacity: 0 }}
										animate={{ opacity: 1 }}
										exit={{ opacity: 0 }}
										style={{ position: 'absolute', inset: 0 }}
									>
										<CanvasRevealEffect
											animationSpeed={3}
											containerClassName="bg-transparent"
											colors={[[172, 191, 164]]}
											dotSize={2}
										/>
										<div style={{ position: 'absolute', inset: 0, background: `${colors.surface2}CC` }} />
									</motion.div>
								)}
							</AnimatePresence>

							{/* Node Flowchart Art Mock */}
							<div style={{ width: '100%', height: 72, position: 'relative', marginBottom: 12, zIndex: 1 }}>
								<svg style={{ width: '100%', height: '100%', position: 'absolute' }}>
									<path d="M 60 36 C 110 36, 110 20, 160 20" fill="none" stroke={colors.borderStrong} strokeWidth="1.5" strokeDasharray="3,3" />
									<path d="M 60 36 C 110 36, 110 52, 160 52" fill="none" stroke={colors.borderStrong} strokeWidth="1.5" strokeDasharray="3,3" />
								</svg>
								{/* Left Node */}
								<div style={{ position: 'absolute', left: '10%', top: '22%', width: 50, height: 36, border: `1px solid ${colors.borderStrong}`, background: colors.surface1, borderRadius: 6, display: 'grid', placeItems: 'center' }}>
									<Sparkles size={11} color={colors.textDim} />
								</div>
								{/* Right Top Node */}
								<div style={{ position: 'absolute', left: '50%', top: '0%', width: 50, height: 26, border: `1px solid ${colors.borderStrong}`, background: colors.surface1, borderRadius: 6, display: 'grid', placeItems: 'center' }}>
									<Video size={11} color={colors.textDim} />
								</div>
								{/* Right Bottom Node */}
								<div style={{ position: 'absolute', left: '50%', top: '56%', width: 50, height: 26, border: `1px solid ${colors.borderStrong}`, background: colors.surface1, borderRadius: 6, display: 'grid', placeItems: 'center' }}>
									<Mic size={11} color={colors.textDim} />
								</div>
							</div>

							<div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
								<div style={{ fontSize: 13, fontWeight: 700, color: colors.text, marginBottom: 4 }}>Create a space</div>
								<p style={{ fontSize: 11, color: colors.textFaint, margin: '0 0 14px', lineHeight: 1.4, maxWidth: 320 }}>
									Build interactive workflows and script camera paths on an infinite cinematic sandbox storyboard.
								</p>
								<button
									onClick={() => {
										handleAddShot();
										setEditorStarted(true); setViewingLanding(false);
									}}
									style={sandboxCreateBtnStyle}
								>
									New space +
								</button>
							</div>
						</div>
					</div>

				</div>
			</div>
		)
	}

	return (
		<div style={{ position: 'fixed', inset: 0, background: colors.surface0, display: 'flex', color: colors.text }}>
			<LeftSidebar
				active={railView}
				onSelect={setRailView}
			/>

			<SidebarPanels
				railView={railView}
				shots={shots}
				assets={assets}
				attachedAssetIds={attachedAssetIds}
				onToggleAttach={toggleAssetAttachment}
				activeShotId={activeShotId}
				collapsed={sidebarCollapsed}
				onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
				onSelect={setActiveShotId}
				onOpenInspector={handleOpenInspector}
				onAddShot={handleAddShot}
				onUpload={handleUpload}
				onPatchShot={patchShot}
				onAddShotFromAsset={handleAddShotFromAsset}
				projectId={projectId}
			/>

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
					onSplitShot={handleSplitShot}
					onDuplicateShot={handleDuplicateShot}
					onDeleteShot={handleDeleteShot}
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
