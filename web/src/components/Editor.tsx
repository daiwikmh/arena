import { useCallback, useEffect, useRef, useState } from 'react'
import { Tldraw, createShapeId, type Editor as TldrawEditor } from 'tldraw'
import 'tldraw/tldraw.css'

import {
	adoptRepair,
	cellImageUrl,
	cellKey as makeCellKey,
	critiqueVision,
	getCampaign,
	liveWebSocketUrl,
	requestPlan,
	requestRepair,
	triggerFanOut,
	type CampaignSummary,
	type Finding,
} from '../lib/api'
import { layoutGrid } from '../lib/grid'
import { ProofFrameShapeUtil, type ProofSeverity } from './proofFrame'
import AgentBar from './AgentBar'
import ReviewPanel from './ReviewPanel'

const SHAPE_UTILS = [ProofFrameShapeUtil]

interface EditorProps {
	campaignId: string
}

export default function Editor({ campaignId }: EditorProps) {
	const editorRef = useRef<TldrawEditor | null>(null)
	const [summary, setSummary] = useState<CampaignSummary | null>(null)
	const [findings, setFindings] = useState<Finding[]>([])
	const [status, setStatus] = useState<string | null>(null)
	const [busy, setBusy] = useState(false)
	const [repairingKey, setRepairingKey] = useState<string | null>(null)

	const onMount = useCallback((editor: TldrawEditor) => {
		editorRef.current = editor
	}, [])

	useEffect(() => {
		getCampaign(campaignId)
			.then(setSummary)
			.catch(() => {
				/* campaign not reachable yet; agent bar will surface errors on first action */
			})

		const ws = new WebSocket(liveWebSocketUrl(campaignId))
		ws.onmessage = () => {
			getCampaign(campaignId).then(setSummary).catch(() => {})
		}
		return () => ws.close()
	}, [campaignId])

	const placeGrid = useCallback((plan: NonNullable<CampaignSummary['plan']>) => {
		const editor = editorRef.current
		if (!editor) return
		const rects = layoutGrid(plan.locales, plan.formats)

		const partials = plan.locales.flatMap((locale) =>
			plan.formats.map((fmt) => {
				const key = makeCellKey(locale.code, fmt.id)
				const rect = rects.get(key)!
				const id = createShapeId(key)
				const existing = editor.getShape(id)
				return {
					id,
					type: 'proof-frame' as const,
					x: rect.x,
					y: rect.y,
					props: {
						w: rect.w,
						h: rect.h,
						localeCode: locale.code,
						formatId: fmt.id,
						severity: (existing?.props as { severity?: ProofSeverity })?.severity ?? 'pending',
						imageUrl: (existing?.props as { imageUrl?: string | null })?.imageUrl ?? null,
						draftId: (existing?.props as { draftId?: string | null })?.draftId ?? null,
					},
				}
			}),
		)

		const toCreate = partials.filter((p) => !editor.getShape(p.id))
		const toUpdate = partials.filter((p) => editor.getShape(p.id))
		if (toCreate.length) editor.createShapes(toCreate)
		if (toUpdate.length) editor.updateShapes(toUpdate)
	}, [])

	const setCellState = useCallback(
		(localeCode: string, formatId: string, patch: { severity?: ProofSeverity; imageUrl?: string | null; draftId?: string | null }) => {
			const editor = editorRef.current
			if (!editor) return
			const id = createShapeId(makeCellKey(localeCode, formatId))
			const shape = editor.getShape(id)
			if (!shape) return
			editor.updateShapes([{ id, type: 'proof-frame', props: { ...shape.props, ...patch } }])
		},
		[],
	)

	const applyFindingsToShapes = useCallback(
		(plan: NonNullable<CampaignSummary['plan']>, newFindings: Finding[]) => {
			const flaggedKeys = new Set(newFindings.map((f) => makeCellKey(f.locale_code, f.format_id)))
			for (const locale of plan.locales) {
				for (const fmt of plan.formats) {
					const key = makeCellKey(locale.code, fmt.id)
					if (flaggedKeys.has(key)) {
						const worst = newFindings
							.filter((f) => makeCellKey(f.locale_code, f.format_id) === key)
							.some((f) => f.severity === 'critical')
							? 'critical'
							: 'warning'
						setCellState(locale.code, fmt.id, { severity: worst })
					} else {
						setCellState(locale.code, fmt.id, { severity: 'clear' })
					}
				}
			}
		},
		[setCellState],
	)

	const runCampaign = useCallback(
		async (intent: string) => {
			setBusy(true)
			try {
				setStatus('Compiling plan…')
				const plan = await requestPlan(campaignId, intent)
				placeGrid(plan)

				setStatus('Generating scenes…')
				const fanOutReport = await triggerFanOut(campaignId)

				for (const locale of plan.locales) {
					for (const fmt of plan.formats) {
						setCellState(locale.code, fmt.id, {
							imageUrl: cellImageUrl(campaignId, locale.code, fmt.id),
						})
					}
				}

				setStatus('Reviewing proofs…')
				const newFindings = await critiqueVision(campaignId)
				setFindings(newFindings)
				applyFindingsToShapes(plan, newFindings)

				const flagged = new Set(newFindings.map((f) => makeCellKey(f.locale_code, f.format_id))).size
				const total = plan.locales.length * plan.formats.length
				setStatus(
					`${flagged} flagged, ${total - flagged} clear · ${fanOutReport.api_calls} generated, ` +
						`${fanOutReport.cache_hits} cached · $${fanOutReport.total_cost_usd.toFixed(2)}`,
				)

				const latest = await getCampaign(campaignId)
				setSummary(latest)
			} catch (err) {
				setStatus(err instanceof Error ? err.message : 'Something went wrong.')
			} finally {
				setBusy(false)
			}
		},
		[campaignId, placeGrid, setCellState, applyFindingsToShapes],
	)

	const handleRepair = useCallback(
		async (localeCode: string, formatId: string) => {
			const key = makeCellKey(localeCode, formatId)
			setRepairingKey(key)
			try {
				const result = await requestRepair(campaignId, { localeCode, formatId })
				if (result.needs_regeneration && result.candidates.length > 0) {
					const chosen = result.candidates[0]
					await adoptRepair(campaignId, { localeCode, formatId, draftId: chosen.id })
					setCellState(localeCode, formatId, {
						imageUrl: cellImageUrl(campaignId, localeCode, formatId),
						draftId: chosen.id,
						severity: 'clear',
					})
				} else {
					setCellState(localeCode, formatId, { severity: 'clear' })
				}
				setFindings((prev) => prev.filter((f) => makeCellKey(f.locale_code, f.format_id) !== key))
				const latest = await getCampaign(campaignId)
				setSummary(latest)
			} catch (err) {
				setStatus(err instanceof Error ? err.message : 'Repair failed.')
			} finally {
				setRepairingKey(null)
			}
		},
		[campaignId, setCellState],
	)

	return (
		<div style={{ position: 'fixed', inset: 0, background: '#0B0D10' }}>
			<div style={{ position: 'absolute', inset: 0, right: summary?.plan ? 320 : 0 }}>
				<Tldraw shapeUtils={SHAPE_UTILS} onMount={onMount} persistenceKey={`presscheck-${campaignId}`} />
			</div>

			{summary?.plan && (
				<ReviewPanel
					findings={findings}
					totalCells={summary.plan.locales.length * summary.plan.formats.length}
					repairingKey={repairingKey}
					onRepair={handleRepair}
				/>
			)}

			<AgentBar status={status} busy={busy} onSubmit={runCampaign} />
		</div>
	)
}
