import { useState, useEffect, useRef, useCallback, type ChangeEvent, type CSSProperties } from 'react'
import {
	ChevronsLeft,
	ChevronsRight,
	Plus,
	Upload,
	Music,
	Volume2,
	Play,
	Pause,
	PlusCircle,
	Sparkles,
	Sliders,
	AlignLeft,
	AlignCenter,
	AlignRight,
	FileText,
	Download,
	Type,
	Mic,
	Square,
	Trash2,
	FileAudio,
	Check,
	RefreshCw,
	Settings2,
	Grid,
	Layers
} from 'lucide-react'
import type { Shot } from './types'
import { colors, font, radius, shadow } from './theme'
import MediaBin from './MediaBin'

interface SidebarPanelsProps {
	railView: string
	shots: Shot[]
	activeShotId: string | null
	collapsed: boolean
	onToggleCollapse: () => void
	onSelect: (shotId: string) => void
	onOpenInspector: (shotId: string) => void
	onAddShot: () => void
	onUpload: (file: File) => void
	onPatchShot: (shotId: string, patch: Partial<Shot>) => void
	projectId: string
}

// Subtitle type
interface SubtitleItem {
	id: string
	shotId: string
	timeRange: string
	text: string
}

// Voiceover type
interface VoiceoverItem {
	id: string
	text: string
	voice: string
	speed: number
	pitch: number
	date: string
}

// Recording type
interface RecordingItem {
	id: string
	durationSec: number
	date: string
}

export default function SidebarPanels({
	railView,
	shots,
	activeShotId,
	collapsed,
	onToggleCollapse,
	onSelect,
	onOpenInspector,
	onAddShot,
	onUpload,
	onPatchShot,
	projectId
}: SidebarPanelsProps) {
	const fileInputRef = useRef<HTMLInputElement>(null)
	const activeShot = shots.find((s) => s.id === activeShotId) ?? null

	// --- 1. Storyboard Manager States ---
	const [arrangeGrid, setArrangeGrid] = useState<'grid' | 'list'>('grid')
	const [exportSuccess, setExportSuccess] = useState<string | null>(null)

	// --- 2. Music & Audio States ---
	const [activeMusicTrack, setActiveMusicTrack] = useState<string | null>(null)
	const [musicVolume, setMusicVolume] = useState<Record<string, number>>({
		ambient: 75,
		cinematic: 80,
		synthwave: 65,
		piano: 70
	})
	const [addedTracks, setAddedTracks] = useState<string[]>([])
	const [duckingEnabled, setDuckingEnabled] = useState(true)
	const [equalizerBars, setEqualizerBars] = useState<number[]>([12, 24, 8, 16, 20])

	// Simulating audio animation bar heights
	useEffect(() => {
		if (!activeMusicTrack) return
		const interval = setInterval(() => {
			setEqualizerBars(Array.from({ length: 6 }, () => Math.floor(Math.random() * 26) + 4))
		}, 120)
		return () => clearInterval(interval)
	}, [activeMusicTrack])

	// --- 3. Subtitles & Captions States ---
	const [selectedPreset, setSelectedPreset] = useState<'netflix' | 'tiktok' | 'cinema'>('netflix')
	const [fontSize, setFontSize] = useState(16)
	const [captionFont, setCaptionFont] = useState('Inter')
	const [textAlignment, setTextAlignment] = useState<'left' | 'center' | 'right'>('center')
	const [captionColor, setCaptionColor] = useState('#FAFAFA')
	const [transcribing, setTranscribing] = useState(false)
	const [transcribeProgress, setTranscribeProgress] = useState(0)
	const [transcribeStep, setTranscribeStep] = useState('')
	const [subtitles, setSubtitles] = useState<SubtitleItem[]>([])

	// --- 4. Voiceover & TTS States ---
	const [ttsScript, setTtsScript] = useState('A wide cinematic shot of the red planet as dust storms begin to gather…')
	const [selectedVoice, setSelectedVoice] = useState('Male - Deep Cinema')
	const [voiceSpeed, setVoiceSpeed] = useState(1.0)
	const [voicePitch, setVoicePitch] = useState(1.0)
	const [generatedVoiceovers, setGeneratedVoiceovers] = useState<VoiceoverItem[]>([])
	const [voiceoverBusy, setVoiceoverBusy] = useState(false)

	// Recording states
	const [isRecording, setIsRecording] = useState(false)
	const [recordTime, setRecordTime] = useState(0)
	const [recordPeaks, setRecordPeaks] = useState<number[]>([])
	const [recordings, setRecordings] = useState<RecordingItem[]>([])
	const recordingInterval = useRef<ReturnType<typeof setInterval> | null>(null)

	// Simulated voice recording peak values
	useEffect(() => {
		if (!isRecording) return
		recordingInterval.current = setInterval(() => {
			setRecordTime((t) => t + 1)
			setRecordPeaks((peaks) => [...peaks.slice(-20), Math.floor(Math.random() * 90) + 10])
		}, 1000)
		return () => {
			if (recordingInterval.current) clearInterval(recordingInterval.current)
		}
	}, [isRecording])

	// --- 5. Title Overlay & Graphics States ---
	const [titleText, setTitleText] = useState('THE LOST VOYAGER')
	const [subtitleText, setSubtitleText] = useState('CHAPTER 1: THE ASCENT')
	const [titlePreset, setTitlePreset] = useState<'act' | 'lower' | 'glitch' | 'retro'>('act')
	const [titleSize, setTitleSize] = useState(32)
	const [letterSpacing, setLetterSpacing] = useState(4)
	const [animationStyle, setAnimationStyle] = useState('fade_in')
	const [appliedOverlays, setAppliedOverlays] = useState<Record<string, string>>({})
	const [overlayAppliedMsg, setOverlayAppliedMsg] = useState(false)

	// Trigger success alerts
	const showTempAlert = (setter: (v: boolean) => void) => {
		setter(true)
		setTimeout(() => setter(false), 2200)
	}

	const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) onUpload(file)
		e.target.value = ''
	}

	// Simulated Auto Transcription logic
	const runAutoTranscription = () => {
		if (shots.length === 0) {
			alert('Please add some shots first before auto-transcribing.')
			return
		}
		setTranscribing(true)
		setTranscribeProgress(0)
		setTranscribeStep('Analyzing background noise...')

		const steps = [
			{ progress: 20, step: 'Extracting audio tracks...' },
			{ progress: 50, step: 'Decoding speech with Omni Whisperer...' },
			{ progress: 80, step: 'Aligning timeline subtitle markers...' },
			{ progress: 100, step: 'Done!' }
		]

		let currentStepIndex = 0
		const interval = setInterval(() => {
			if (currentStepIndex < steps.length) {
				const s = steps[currentStepIndex]
				setTranscribeProgress(s.progress)
				setTranscribeStep(s.step)
				currentStepIndex++
			} else {
				clearInterval(interval)
				// Create simulated subtitles
				const subs = shots.map((shot, idx) => {
					const start = shot.startSec
					const end = shot.startSec + (shot.trimEndSec - shot.trimStartSec)
					return {
						id: `sub-${idx}-${Date.now()}`,
						shotId: shot.id,
						timeRange: `${start.toFixed(1)}s - ${end.toFixed(1)}s`,
						text: shot.label.startsWith('Shot')
							? `This is the spoken voiceover or action text for ${shot.label}.`
							: shot.label
					}
				})
				setSubtitles(subs)
				setTranscribing(false)
			}
		}, 600)
	}

	// Simulated Voiceover generation
	const handleGenerateTTS = () => {
		if (!ttsScript.trim()) return
		setVoiceoverBusy(true)
		setTimeout(() => {
			const newItem: VoiceoverItem = {
				id: `tts-${Date.now()}`,
				text: ttsScript.trim(),
				voice: selectedVoice,
				speed: voiceSpeed,
				pitch: voicePitch,
				date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
			}
			setGeneratedVoiceovers((prev) => [newItem, ...prev])
			setVoiceoverBusy(false)
		}, 1400)
	}

	// Recording Start/Stop
	const toggleRecording = () => {
		if (isRecording) {
			// Stop recording
			setIsRecording(false)
			const length = recordTime
			setRecordTime(0)
			const newItem: RecordingItem = {
				id: `rec-${Date.now()}`,
				durationSec: length === 0 ? 3 : length,
				date: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
			}
			setRecordings((prev) => [newItem, ...prev])
		} else {
			// Start recording
			setRecordPeaks([])
			setRecordTime(0)
			setIsRecording(true)
		}
	}

	// Apply Title Overlay
	const handleApplyTitleOverlay = () => {
		if (!activeShot) {
			alert('Please select a shot first in order to apply the overlay titles.')
			return
		}
		setAppliedOverlays((prev) => ({
			...prev,
			[activeShot.id]: `${titleText} (${subtitleText})`
		}))
		onPatchShot(activeShot.id, {
			label: `${titleText.slice(0, 20)}...`
		})
		showTempAlert(setOverlayAppliedMsg)
	}

	// Export Storyboard
	const triggerExport = (format: string) => {
		setExportSuccess(format)
		setTimeout(() => setExportSuccess(null), 3000)
	}

	// Main collapsible wrapper render
	if (collapsed) {
		return (
			<div
				style={{
					width: 40,
					flex: 'none',
					background: colors.surface1,
					borderRight: `1px solid ${colors.border}`,
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					paddingTop: 10,
					zIndex: 25
				}}
			>
				<button
					onClick={onToggleCollapse}
					title={`Expand ${railView} panel`}
					style={{
						width: 28,
						height: 28,
						display: 'grid',
						placeItems: 'center',
						border: `1px solid ${colors.border}`,
						borderRadius: radius.sm,
						background: colors.surface2,
						color: colors.textDim,
						cursor: 'pointer'
					}}
				>
					<ChevronsRight size={14} strokeWidth={1.6} />
				</button>
			</div>
		)
	}

	return (
		<div
			style={{
				width: 310,
				flex: 'none',
				background: colors.surface1,
				borderRight: `1px solid ${colors.border}`,
				display: 'flex',
				flexDirection: 'column',
				overflow: 'hidden',
				zIndex: 25
			}}
		>
			{/* Common Header */}
			<div
				style={{
					display: 'flex',
					alignItems: 'center',
					gap: 8,
					padding: '10px 10px 10px 12px',
					borderBottom: `1px solid ${colors.border}`,
					background: colors.surface2
				}}
			>
				<span
					style={{
						fontSize: 10.5,
						letterSpacing: '0.12em',
						textTransform: 'uppercase',
						color: colors.textFaint,
						fontFamily: font.mono,
						fontWeight: 600
					}}
				>
					{railView} controls
				</span>
				<span style={{ flex: 1 }} />
				<button onClick={onToggleCollapse} title="Collapse Panel" style={iconButtonStyle}>
					<ChevronsLeft size={13} strokeWidth={1.6} />
				</button>
			</div>

			{/* Sub-Panel Renderers depending on active railView */}

			{/* VIEW 1: MEDIA BIN */}
			{railView === 'media' && (
				<div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
					<MediaBin
						shots={shots}
						activeShotId={activeShotId}
						collapsed={false}
						onToggleCollapse={onToggleCollapse}
						onSelect={onSelect}
						onOpenInspector={onOpenInspector}
						onAddShot={onAddShot}
						onUpload={onUpload}
					/>
				</div>
			)}

			{/* VIEW 2: STORYBOARD SETTINGS */}
			{railView === 'storyboard' && (
				<div style={panelBodyStyle}>
					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Layers size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Scene Order</span>
						</div>
						<p style={descStyle}>Select scenes to configure candidate takes and view framing metadata.</p>

						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							{shots.map((shot, idx) => (
								<button
									key={shot.id}
									onClick={() => onSelect(shot.id)}
									style={{
										...itemRowStyle,
										background: shot.id === activeShotId ? colors.surface3 : colors.surface2,
										border: `1px solid ${shot.id === activeShotId ? colors.borderStrong : colors.border}`
									}}
								>
									<span style={{ fontFamily: font.mono, fontSize: 11, color: colors.textFaint }}>
										#{idx + 1}
									</span>
									<span style={{ flex: 1, fontSize: 12, color: colors.textDim, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
										{shot.label}
									</span>
									<span style={{ fontFamily: font.mono, fontSize: 10, color: colors.textFaint }}>
										{shot.aspectRatio}
									</span>
								</button>
							))}
							{shots.length === 0 && (
								<div style={emptyStateStyle}>No active shots. Start typing in the chat to generate scenes.</div>
							)}
						</div>
					</div>

					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Settings2 size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Layout Mode</span>
						</div>
						<div style={{ display: 'flex', gap: 6 }}>
							<button
								onClick={() => setArrangeGrid('grid')}
								style={{
									...tabStyle,
									background: arrangeGrid === 'grid' ? colors.surface3 : 'transparent',
									borderColor: arrangeGrid === 'grid' ? colors.borderStrong : colors.border,
									flex: 1
								}}
							>
								Multi-Take Grid
							</button>
							<button
								onClick={() => setArrangeGrid('list')}
								style={{
									...tabStyle,
									background: arrangeGrid === 'list' ? colors.surface3 : 'transparent',
									borderColor: arrangeGrid === 'list' ? colors.borderStrong : colors.border,
									flex: 1
								}}
							>
								Compact List
							</button>
						</div>
					</div>

					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<FileText size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Deliverables</span>
						</div>
						<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
							<button onClick={() => triggerExport('PDF Storyboard')} style={primaryButtonStyle}>
								<Download size={12} style={{ marginRight: 6 }} /> Export PDF Draft
							</button>
							<button onClick={() => triggerExport('Director Script')} style={secondaryButtonStyle}>
								<FileText size={12} style={{ marginRight: 6 }} /> Download Script (.json)
							</button>
						</div>

						{exportSuccess && (
							<div style={successBoxStyle}>
								<Check size={12} style={{ color: colors.white, marginRight: 4 }} />
								{exportSuccess} compiled successfully!
							</div>
						)}
					</div>
				</div>
			)}

			{/* VIEW 3: MUSIC & AUDIO */}
			{railView === 'music' && (
				<div style={panelBodyStyle}>
					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Music size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Background Tracks</span>
						</div>
						<p style={descStyle}>Audition cinematic tracks. Added tracks are synced into the Omni renderer.</p>

						<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
							{[
								{ id: 'ambient', name: 'Dune Echoes', desc: 'Ambient Drone · 85 BPM' },
								{ id: 'cinematic', name: 'Cosmic Drift', desc: 'Cinematic Orchestral · 70 BPM' },
								{ id: 'synthwave', name: 'Neon Horizon', desc: 'Cyber Retro · 110 BPM' },
								{ id: 'piano', name: 'Starlight Lullaby', desc: 'Minimalist Piano · 60 BPM' }
							].map((track) => {
								const isPlaying = activeMusicTrack === track.id
								const isAdded = addedTracks.includes(track.id)
								return (
									<div key={track.id} style={audioCardStyle}>
										<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
											<button
												onClick={() => setActiveMusicTrack(isPlaying ? null : track.id)}
												style={playbackButtonStyle}
											>
												{isPlaying ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
											</button>
											<div style={{ flex: 1 }}>
												<div style={{ fontSize: 12, fontWeight: 500, color: colors.text }}>{track.name}</div>
												<div style={{ fontSize: 10.5, color: colors.textFaint }}>{track.desc}</div>
											</div>

											{isPlaying && (
												<div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
													{equalizerBars.map((b, i) => (
														<div
															key={i}
															style={{
																width: 2,
																height: `${b}%`,
																background: colors.white,
																transition: 'height 0.1s ease'
															}}
														/>
													))}
												</div>
											)}
										</div>

										{isPlaying && (
											<div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
												<Volume2 size={11} style={{ color: colors.textFaint }} />
												<input
													type="range"
													min="0"
													max="100"
													value={musicVolume[track.id]}
													onChange={(e) => setMusicVolume({ ...musicVolume, [track.id]: Number(e.target.value) })}
													style={{ flex: 1, height: 3 }}
												/>
												<span style={{ fontSize: 9.5, fontFamily: font.mono, color: colors.textFaint, minWidth: 20 }}>
													{musicVolume[track.id]}%
												</span>
											</div>
										)}

										<button
											onClick={() => {
												if (isAdded) {
													setAddedTracks(addedTracks.filter((t) => t !== track.id))
												} else {
													setAddedTracks([...addedTracks, track.id])
												}
											}}
											style={{
												...miniActionButtonStyle,
												borderColor: isAdded ? colors.white : colors.borderStrong,
												color: isAdded ? colors.black : colors.textDim,
												background: isAdded ? colors.white : 'transparent',
												marginTop: 6
											}}
										>
											{isAdded ? 'Remove from Scene' : 'Add to Timeline'}
										</button>
									</div>
								)
							})}
						</div>
					</div>

					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Sliders size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Master Audio Config</span>
						</div>
						<div style={rowControlStyle}>
							<span style={labelSpanStyle}>Ducking Mode</span>
							<input
								type="checkbox"
								checked={duckingEnabled}
								onChange={(e) => setDuckingEnabled(e.target.checked)}
								style={{ cursor: 'pointer' }}
							/>
						</div>
						<p style={{ ...descStyle, marginTop: 4 }}>
							Reduces background music volume by 12dB automatically during dialogue or voiceover segments.
						</p>
					</div>
				</div>
			)}

			{/* VIEW 4: CAPTIONS & SUBTITLES */}
			{railView === 'captions' && (
				<div style={panelBodyStyle}>
					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Sparkles size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Auto Captions Generator</span>
						</div>
						<p style={descStyle}>Generate localized text subtitles based on shot narrative prompts automatically.</p>

						<button
							onClick={runAutoTranscription}
							disabled={transcribing}
							style={{
								...primaryButtonStyle,
								background: transcribing ? colors.surface3 : colors.white,
								color: transcribing ? colors.textFaint : colors.black
							}}
						>
							{transcribing ? 'Generating Subtitles...' : 'Transcribe Dialogue'}
						</button>

						{transcribing && (
							<div style={{ marginTop: 10 }}>
								<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: colors.textFaint, marginBottom: 4 }}>
									<span>{transcribeStep}</span>
									<span>{transcribeProgress}%</span>
								</div>
								<div style={{ width: '100%', height: 4, background: colors.surface3, borderRadius: 2, overflow: 'hidden' }}>
									<div style={{ width: `${transcribeProgress}%`, height: '100%', background: colors.white }} />
								</div>
							</div>
						)}
					</div>

					{subtitles.length > 0 && (
						<div style={sectionStyle}>
							<div style={headerRowStyle}>
								<FileText size={13} style={{ color: colors.textDim }} />
								<span style={subHeaderStyle}>Active Timeline Subtitles</span>
							</div>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
								{subtitles.map((sub, idx) => (
									<div key={sub.id} style={subCardStyle}>
										<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
											<span style={{ fontSize: 9.5, fontFamily: font.mono, color: colors.textFaint }}>
												{sub.timeRange}
											</span>
											<button
												onClick={() => setSubtitles(subtitles.filter((s) => s.id !== sub.id))}
												style={deleteIconStyle}
											>
												<Trash2 size={11} />
											</button>
										</div>
										<input
											type="text"
											value={sub.text}
											onChange={(e) => {
												const val = e.target.value
												setSubtitles(subtitles.map((s) => s.id === sub.id ? { ...s, text: val } : s))
											}}
											style={subInputStyle}
										/>
									</div>
								))}
							</div>
						</div>
					)}

					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Type size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Caption Typography</span>
						</div>

						{/* Style presets */}
						<div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
							<span style={labelSpanStyle}>Styling Presets</span>
							<div style={{ display: 'flex', gap: 4 }}>
								{[
									{ id: 'netflix', label: 'Netflix' },
									{ id: 'tiktok', label: 'TikTok' },
									{ id: 'cinema', label: 'Cinematic' }
								].map((preset) => (
									<button
										key={preset.id}
										onClick={() => {
											setSelectedPreset(preset.id as any)
											if (preset.id === 'tiktok') {
												setCaptionColor('#FBBF24')
												setFontSize(20)
												setCaptionFont('Barlow')
												setTextAlignment('center')
											} else if (preset.id === 'cinema') {
												setCaptionColor('#E4E4E7')
												setFontSize(14)
												setCaptionFont('Instrument Serif')
												setTextAlignment('center')
											} else {
												setCaptionColor('#FAFAFA')
												setFontSize(16)
												setCaptionFont('Inter')
												setTextAlignment('center')
											}
										}}
										style={{
											...tabStyle,
											background: selectedPreset === preset.id ? colors.surface3 : 'transparent',
											borderColor: selectedPreset === preset.id ? colors.borderStrong : colors.border,
											flex: 1,
											fontSize: 10.5
										}}
									>
										{preset.label}
									</button>
								))}
							</div>
						</div>

						<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
							<label style={fieldLabelStyle}>
								<span style={labelSpanStyle}>Font Face</span>
								<select
									value={captionFont}
									onChange={(e) => setCaptionFont(e.target.value)}
									style={selectStyle}
								>
									<option value="Inter">Inter (Sans)</option>
									<option value="Barlow">Barlow (Bold Pro)</option>
									<option value="Instrument Serif">Instrument Serif</option>
									<option value="Dirtyline">Dirtyline (Glitch)</option>
									<option value="SF Mono">SF Mono (Coding)</option>
								</select>
							</label>

							<label style={fieldLabelStyle}>
								<span style={{ ...labelSpanStyle, display: 'flex', justifyContent: 'space-between' }}>
									<span>Text Size</span>
									<span>{fontSize}px</span>
								</span>
								<input
									type="range"
									min="12"
									max="36"
									value={fontSize}
									onChange={(e) => setFontSize(Number(e.target.value))}
									style={{ width: '100%', height: 3 }}
								/>
							</label>

							<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
								<span style={labelSpanStyle}>Text Alignment</span>
								<div style={{ display: 'flex', gap: 4 }}>
									{[
										{ id: 'left', Icon: AlignLeft },
										{ id: 'center', Icon: AlignCenter },
										{ id: 'right', Icon: AlignRight }
									].map((align) => (
										<button
											key={align.id}
											onClick={() => setTextAlignment(align.id as any)}
											style={{
												...tabStyle,
												background: textAlignment === align.id ? colors.surface3 : 'transparent',
												borderColor: textAlignment === align.id ? colors.borderStrong : colors.border,
												flex: 1
											}}
										>
											<align.Icon size={12} />
										</button>
									))}
								</div>
							</div>

							<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
								<span style={labelSpanStyle}>Text Color</span>
								<div style={{ display: 'flex', gap: 6 }}>
									{['#FAFAFA', '#FBBF24', '#22C55E', '#06B6D4', '#F97316'].map((color) => (
										<button
											key={color}
											onClick={() => setCaptionColor(color)}
											style={{
												width: 20,
												height: 20,
												borderRadius: radius.pill,
												backgroundColor: color,
												border: `2px solid ${captionColor === color ? colors.white : 'transparent'}`,
												cursor: 'pointer'
											}}
										/>
									))}
								</div>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* VIEW 5: VOICEOVER & TTS */}
			{railView === 'voice' && (
				<div style={panelBodyStyle}>
					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Sparkles size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>AI Text-to-Speech</span>
						</div>
						<p style={descStyle}>Translate written narratives into voice clips with localized AI announcers.</p>

						<textarea
							value={ttsScript}
							onChange={(e) => setTtsScript(e.target.value)}
							rows={3}
							style={textareaStyle}
							placeholder="Enter voice script text..."
						/>

						<div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
							<label style={fieldLabelStyle}>
								<span style={labelSpanStyle}>Voice Actor Profile</span>
								<select
									value={selectedVoice}
									onChange={(e) => setSelectedVoice(e.target.value)}
									style={selectStyle}
								>
									<option value="Male - Deep Cinema">Male - Deep Cinema</option>
									<option value="Female - Soft Narrative">Female - Soft Narrative</option>
									<option value="AI Director - Calm Echo">AI Director - Calm Echo</option>
									<option value="Synth Radio">Synth Radio (Vocoder)</option>
								</select>
							</label>

							<label style={fieldLabelStyle}>
								<span style={{ ...labelSpanStyle, display: 'flex', justifyContent: 'space-between' }}>
									<span>Speed Multiplier</span>
									<span>{voiceSpeed}x</span>
								</span>
								<input
									type="range"
									min="0.5"
									max="2.0"
									step="0.1"
									value={voiceSpeed}
									onChange={(e) => setVoiceSpeed(Number(e.target.value))}
									style={{ width: '100%', height: 3 }}
								/>
							</label>

							<button
								onClick={handleGenerateTTS}
								disabled={voiceoverBusy || !ttsScript.trim()}
								style={{
									...primaryButtonStyle,
									background: voiceoverBusy ? colors.surface3 : colors.white,
									color: voiceoverBusy ? colors.textFaint : colors.black
								}}
							>
								{voiceoverBusy ? 'Compiling Audio...' : 'Generate Voiceover'}
							</button>
						</div>
					</div>

					{/* Live Micro recorder */}
					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Mic size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Live Microphone Record</span>
						</div>
						<p style={descStyle}>Record live audio directly into your timeline using your local microphone.</p>

						<div style={{ display: 'flex', alignItems: 'center', gap: 10, background: colors.surface2, padding: 8, borderRadius: radius.md, border: `1px solid ${colors.border}` }}>
							<button
								onClick={toggleRecording}
								style={{
									width: 32,
									height: 32,
									borderRadius: radius.pill,
									background: isRecording ? colors.critical : colors.surface4,
									color: '#FAFAFA',
									display: 'grid',
									placeItems: 'center',
									border: 0,
									cursor: 'pointer'
								}}
							>
								{isRecording ? <Square size={12} fill="currentColor" /> : <Mic size={12} />}
							</button>

							<div style={{ flex: 1 }}>
								<div style={{ fontSize: 12, fontWeight: 500, color: colors.text }}>
									{isRecording ? 'Recording Sound...' : 'Mic Ready'}
								</div>
								<div style={{ fontSize: 10.5, fontFamily: font.mono, color: colors.textFaint }}>
									{isRecording
										? `00:${String(recordTime).padStart(2, '0')}`
										: 'No active recording'}
								</div>
							</div>

							{isRecording && (
								<div style={{ display: 'flex', alignItems: 'center', gap: 1, width: 60, height: 20 }}>
									{recordPeaks.map((p, i) => (
										<div
											key={i}
											style={{
												flex: 1,
												height: `${p}%`,
												backgroundColor: colors.critical,
												borderRadius: 1
											}}
										/>
									))}
								</div>
							)}
						</div>
					</div>

					{/* Recordings Bin */}
					{(recordings.length > 0 || generatedVoiceovers.length > 0) && (
						<div style={sectionStyle}>
							<div style={headerRowStyle}>
								<FileAudio size={13} style={{ color: colors.textDim }} />
								<span style={subHeaderStyle}>Audio Master Library</span>
							</div>
							<div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
								{recordings.map((rec) => (
									<div key={rec.id} style={audioRowStyle}>
										<FileAudio size={12} style={{ color: colors.textFaint }} />
										<span style={{ fontSize: 11.5, flex: 1, color: colors.textDim }}>
											Live Mic Record ({rec.durationSec}s)
										</span>
										<span style={{ fontSize: 9.5, fontFamily: font.mono, color: colors.textFaint }}>
											{rec.date}
										</span>
										<button
											onClick={() => setRecordings(recordings.filter((r) => r.id !== rec.id))}
											style={deleteIconStyle}
										>
											<Trash2 size={11} />
										</button>
									</div>
								))}

								{generatedVoiceovers.map((tts) => (
									<div key={tts.id} style={audioRowStyle}>
										<Sparkles size={11} style={{ color: colors.textFaint }} />
										<span style={{ fontSize: 11.5, flex: 1, color: colors.textDim, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={tts.text}>
											{tts.text}
										</span>
										<span style={{ fontSize: 9.5, fontFamily: font.mono, color: colors.textFaint }}>
											{tts.date}
										</span>
										<button
											onClick={() => setGeneratedVoiceovers(generatedVoiceovers.filter((t) => t.id !== tts.id))}
											style={deleteIconStyle}
										>
											<Trash2 size={11} />
										</button>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			)}

			{/* VIEW 6: TITLE OVERLAYS & GRAPHICS */}
			{railView === 'text' && (
				<div style={panelBodyStyle}>
					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Layers size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Title Layout Presets</span>
						</div>
						<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
							{[
								{ id: 'act', name: 'Cinematic Act' },
								{ id: 'lower', name: 'Lower Third' },
								{ id: 'glitch', name: 'Cyber Glitch' },
								{ id: 'retro', name: 'Vintage Novel' }
							].map((preset) => (
								<button
									key={preset.id}
									onClick={() => {
										setTitlePreset(preset.id as any)
										if (preset.id === 'lower') {
											setTitleSize(18)
											setLetterSpacing(1)
											setAnimationStyle('slide_up')
										} else if (preset.id === 'glitch') {
											setTitleSize(26)
											setLetterSpacing(2)
											setAnimationStyle('typewriter')
										} else if (preset.id === 'retro') {
											setTitleSize(22)
											setLetterSpacing(6)
											setAnimationStyle('scale_zoom')
										} else {
											setTitleSize(32)
											setLetterSpacing(4)
											setAnimationStyle('fade_in')
										}
									}}
									style={{
										...tabStyle,
										background: titlePreset === preset.id ? colors.surface3 : 'transparent',
										borderColor: titlePreset === preset.id ? colors.borderStrong : colors.border,
										fontSize: 11,
										height: 38,
										textAlign: 'center',
										justifyContent: 'center'
									}}
								>
									{preset.name}
								</button>
							))}
						</div>
					</div>

					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Type size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Edit Overlay Content</span>
						</div>

						<div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
							<label style={fieldLabelStyle}>
								<span style={labelSpanStyle}>Main Headline Text</span>
								<input
									type="text"
									value={titleText}
									onChange={(e) => setTitleText(e.target.value)}
									style={inputStyle}
								/>
							</label>

							<label style={fieldLabelStyle}>
								<span style={labelSpanStyle}>Secondary Subtitle</span>
								<input
									type="text"
									value={subtitleText}
									onChange={(e) => setSubtitleText(e.target.value)}
									style={inputStyle}
								/>
							</label>
						</div>
					</div>

					<div style={sectionStyle}>
						<div style={headerRowStyle}>
							<Sliders size={13} style={{ color: colors.textDim }} />
							<span style={subHeaderStyle}>Geometry & Animation</span>
						</div>

						<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
							<label style={fieldLabelStyle}>
								<span style={{ ...labelSpanStyle, display: 'flex', justifyContent: 'space-between' }}>
									<span>Text Scale</span>
									<span>{titleSize}px</span>
								</span>
								<input
									type="range"
									min="14"
									max="48"
									value={titleSize}
									onChange={(e) => setTitleSize(Number(e.target.value))}
									style={{ width: '100%', height: 3 }}
								/>
							</label>

							<label style={fieldLabelStyle}>
								<span style={{ ...labelSpanStyle, display: 'flex', justifyContent: 'space-between' }}>
									<span>Letter Spacing</span>
									<span>{letterSpacing}px</span>
								</span>
								<input
									type="range"
									min="0"
									max="12"
									value={letterSpacing}
									onChange={(e) => setLetterSpacing(Number(e.target.value))}
									style={{ width: '100%', height: 3 }}
								/>
							</label>

							<label style={fieldLabelStyle}>
								<span style={labelSpanStyle}>Motion Curve</span>
								<select
									value={animationStyle}
									onChange={(e) => setAnimationStyle(e.target.value)}
									style={selectStyle}
								>
									<option value="fade_in">Fade Smooth</option>
									<option value="typewriter">Glitch Typewriter</option>
									<option value="slide_up">Lower Slide Up</option>
									<option value="scale_zoom">Zoom Minimalist</option>
								</select>
							</label>

							<button onClick={handleApplyTitleOverlay} style={primaryButtonStyle}>
								Apply Overlay to Scene
							</button>

							{overlayAppliedMsg && (
								<div style={successBoxStyle}>
									<Check size={12} style={{ color: colors.white, marginRight: 4 }} />
									Overlay successfully applied to scene!
								</div>
							)}
						</div>
					</div>
				</div>
			)}
		</div>
	)
}

const panelBodyStyle: CSSProperties = {
	flex: 1,
	overflowY: 'auto',
	padding: 14,
	display: 'flex',
	flexDirection: 'column',
	gap: 18
}

const sectionStyle: CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: 10
}

const headerRowStyle: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 6
}

const subHeaderStyle: CSSProperties = {
	fontSize: 11.5,
	fontWeight: 600,
	color: colors.text,
	letterSpacing: '0.04em',
	textTransform: 'uppercase'
}

const descStyle: CSSProperties = {
	fontSize: 11,
	color: colors.textFaint,
	lineHeight: 1.4,
	margin: 0
}

const emptyStateStyle: CSSProperties = {
	fontSize: 11,
	color: colors.textFaint,
	padding: '12px 10px',
	border: `1px dashed ${colors.border}`,
	borderRadius: radius.md,
	textAlign: 'center'
}

const itemRowStyle: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	padding: '8px 10px',
	borderRadius: radius.md,
	cursor: 'pointer',
	textAlign: 'left',
	gap: 8,
	transition: 'background-color 0.1s ease'
}

const audioCardStyle: CSSProperties = {
	background: colors.surface2,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.md,
	padding: 10,
	display: 'flex',
	flexDirection: 'column',
	gap: 6
}

const subCardStyle: CSSProperties = {
	background: colors.surface2,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.md,
	padding: 8,
	display: 'flex',
	flexDirection: 'column'
}

const audioRowStyle: CSSProperties = {
	display: 'flex',
	alignItems: 'center',
	gap: 6,
	padding: '6px 8px',
	background: colors.surface2,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm
}

const deleteIconStyle: CSSProperties = {
	background: 'transparent',
	border: 0,
	color: colors.textFaint,
	cursor: 'pointer',
	padding: 2,
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center'
}

const subInputStyle: CSSProperties = {
	width: '100%',
	background: colors.surface3,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm,
	color: colors.text,
	fontSize: 11.5,
	padding: '4px 6px',
	outline: 'none'
}

const textareaStyle: CSSProperties = {
	width: '100%',
	background: colors.surface2,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.md,
	color: colors.text,
	fontSize: 12,
	padding: '8px 10px',
	resize: 'none',
	outline: 'none',
	lineHeight: 1.4
}

const inputStyle: CSSProperties = {
	width: '100%',
	height: 30,
	background: colors.surface2,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm,
	color: colors.text,
	fontSize: 12,
	padding: '0 8px',
	outline: 'none'
}

const selectStyle: CSSProperties = {
	width: '100%',
	height: 30,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm,
	background: colors.surface2,
	color: colors.text,
	fontSize: 12,
	padding: '0 8px',
	outline: 'none',
	cursor: 'pointer'
}

const primaryButtonStyle: CSSProperties = {
	width: '100%',
	height: 32,
	background: colors.white,
	color: colors.black,
	border: 0,
	borderRadius: radius.sm,
	fontSize: 11.5,
	fontWeight: 600,
	cursor: 'pointer',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center'
}

const secondaryButtonStyle: CSSProperties = {
	width: '100%',
	height: 32,
	background: colors.surface3,
	color: colors.text,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm,
	fontSize: 11.5,
	fontWeight: 500,
	cursor: 'pointer',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center'
}

const tabStyle: CSSProperties = {
	height: 28,
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm,
	color: colors.textDim,
	fontSize: 11,
	fontWeight: 500,
	cursor: 'pointer',
	display: 'flex',
	alignItems: 'center',
	justifyContent: 'center',
	transition: 'background-color 0.1s ease, border-color 0.1s ease'
}

const playbackButtonStyle: CSSProperties = {
	width: 24,
	height: 24,
	borderRadius: radius.pill,
	background: colors.surface4,
	color: colors.text,
	display: 'grid',
	placeItems: 'center',
	border: 0,
	cursor: 'pointer'
}

const miniActionButtonStyle: CSSProperties = {
	padding: '4px 8px',
	fontSize: 9.5,
	fontWeight: 600,
	borderRadius: radius.sm,
	border: `1px solid ${colors.borderStrong}`,
	background: 'transparent',
	cursor: 'pointer',
	transition: 'all 0.15s ease'
}

const iconButtonStyle: CSSProperties = {
	width: 24,
	height: 24,
	display: 'grid',
	placeItems: 'center',
	border: `1px solid ${colors.border}`,
	borderRadius: radius.sm,
	background: colors.surface3,
	color: colors.textDim,
	cursor: 'pointer',
	flex: 'none'
}

const rowControlStyle: CSSProperties = {
	display: 'flex',
	justifyContent: 'space-between',
	alignItems: 'center',
	background: colors.surface2,
	border: `1px solid ${colors.border}`,
	padding: '8px 10px',
	borderRadius: radius.md
}

const labelSpanStyle: CSSProperties = {
	fontSize: 10.5,
	color: colors.textFaint,
	fontWeight: 500
}

const fieldLabelStyle: CSSProperties = {
	display: 'flex',
	flexDirection: 'column',
	gap: 4
}

const successBoxStyle: CSSProperties = {
	padding: '6px 10px',
	background: colors.surface3,
	border: `1px solid ${colors.borderStrong}`,
	borderRadius: radius.sm,
	color: colors.white,
	fontSize: 11,
	display: 'flex',
	alignItems: 'center'
}
