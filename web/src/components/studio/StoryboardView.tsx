import { useCallback, useEffect, useRef } from 'react'
import { Tldraw, createShapeId, type Editor as TldrawEditor } from 'tldraw'
import 'tldraw/tldraw.css'
import { ProofFrameShapeUtil } from '../proofFrame'
import type { Shot } from './types'
import { colors } from './theme'

const SHAPE_UTILS = [ProofFrameShapeUtil]
const CANDIDATE_LABELS = ['Take 1', 'Take 2', 'Take 3']

interface StoryboardViewProps {
	shot: Shot | null
	projectId: string
}

export default function StoryboardView({ shot, projectId }: StoryboardViewProps) {
	const editorRef = useRef<TldrawEditor | null>(null)

	const onMount = useCallback(
		(editor: TldrawEditor) => {
			editorRef.current = editor
			if (!shot) return

			const partials = CANDIDATE_LABELS.map((label, i) => {
				const id = createShapeId(`${shot.id}-candidate-${i}`)
				if (editor.getShape(id)) return null
				return {
					id,
					type: 'proof-frame' as const,
					x: i * 244,
					y: 0,
					props: {
						w: 220,
						h: 220,
						localeCode: label,
						formatId: `${shot.durationSec}s`,
						severity: 'pending' as const,
						imageUrl: shot.keyframeUrl,
						draftId: null,
					},
				}
			}).filter((p): p is NonNullable<typeof p> => p !== null)

			if (partials.length) editor.createShapes(partials)
		},
		[shot],
	)

	useEffect(() => {
		const editor = editorRef.current
		if (!editor || !shot) return
		CANDIDATE_LABELS.forEach((label, i) => {
			const id = createShapeId(`${shot.id}-candidate-${i}`)
			if (!editor.getShape(id)) {
				editor.createShapes([
					{
						id,
						type: 'proof-frame',
						x: i * 244,
						y: 0,
						props: {
							w: 220,
							h: 220,
							localeCode: label,
							formatId: `${shot.durationSec}s`,
							severity: 'pending',
							imageUrl: shot.keyframeUrl,
							draftId: null,
						},
					},
				])
			}
		})
	}, [shot])

	if (!shot) {
		return (
			<div style={{ flex: 1, display: 'grid', placeItems: 'center', color: colors.textFaint, fontSize: 13 }}>
				Select a shot to compare keyframe takes.
			</div>
		)
	}

	return (
		<div style={{ flex: 1, position: 'relative' }}>
			<Tldraw shapeUtils={SHAPE_UTILS} onMount={onMount} persistenceKey={`studio-storyboard-${projectId}`} />
		</div>
	)
}
