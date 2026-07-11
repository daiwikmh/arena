import { HTMLContainer, Rectangle2d, ShapeUtil, T, type RecordProps, type TLShape } from 'tldraw'

export type ProofSeverity = 'pending' | 'clear' | 'warning' | 'critical'

const PROOF_FRAME_TYPE = 'proof-frame'

export interface ProofFrameProps {
	w: number
	h: number
	localeCode: string
	formatId: string
	draftId: string | null
	imageUrl: string | null
	severity: ProofSeverity
}

declare module 'tldraw' {
	interface TLGlobalShapePropsMap {
		[PROOF_FRAME_TYPE]: ProofFrameProps
	}
}

export type ProofFrameShape = TLShape<typeof PROOF_FRAME_TYPE>

const SEVERITY_COLOR: Record<ProofSeverity, string> = {
	pending: '#6B727A',
	clear: '#2E7D4F',
	warning: '#B87503',
	critical: '#C4302B',
}

const SEVERITY_LABEL: Record<ProofSeverity, string> = {
	pending: 'generating…',
	clear: 'clear',
	warning: 'needs review',
	critical: 'fail',
}

export class ProofFrameShapeUtil extends ShapeUtil<ProofFrameShape> {
	static override type = 'proof-frame' as const

	static override props: RecordProps<ProofFrameShape> = {
		w: T.number,
		h: T.number,
		localeCode: T.string,
		formatId: T.string,
		draftId: T.string.nullable(),
		imageUrl: T.string.nullable(),
		severity: T.literalEnum('pending', 'clear', 'warning', 'critical'),
	}

	getDefaultProps(): ProofFrameShape['props'] {
		return {
			w: 220,
			h: 220,
			localeCode: '',
			formatId: '1:1',
			draftId: null,
			imageUrl: null,
			severity: 'pending',
		}
	}

	getGeometry(shape: ProofFrameShape) {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		})
	}

	override canResize() {
		return false
	}

	override canEdit() {
		return false
	}

	component(shape: ProofFrameShape) {
		const { w, h, localeCode, formatId, imageUrl, severity } = shape.props
		const stripeColor = SEVERITY_COLOR[severity]

		return (
			<HTMLContainer
				style={{
					width: w,
					height: h,
					background: '#1F242A',
					border: '1px solid #3D444C',
					borderRadius: 2,
					overflow: 'hidden',
					position: 'relative',
					fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
				}}
			>
				<div
					style={{
						position: 'absolute',
						left: 0,
						top: 0,
						bottom: 0,
						width: 3,
						background: stripeColor,
					}}
				/>

				{imageUrl ? (
					<img
						src={imageUrl}
						draggable={false}
						style={{
							width: '100%',
							height: '100%',
							objectFit: 'cover',
							pointerEvents: 'none',
						}}
					/>
				) : (
					<div
						style={{
							width: '100%',
							height: '100%',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							color: '#6B727A',
							fontSize: 11,
							letterSpacing: '0.05em',
						}}
					>
						{SEVERITY_LABEL[severity]}
					</div>
				)}

				<div
					style={{
						position: 'absolute',
						left: 8,
						top: 6,
						fontSize: 10.5,
						color: '#fff',
						textShadow: '0 1px 4px rgba(0,0,0,0.8)',
						letterSpacing: '0.02em',
					}}
				>
					{localeCode}
				</div>
				<div
					style={{
						position: 'absolute',
						right: 8,
						top: 6,
						fontSize: 10.5,
						color: 'rgba(255,255,255,0.75)',
						textShadow: '0 1px 4px rgba(0,0,0,0.8)',
					}}
				>
					{formatId}
				</div>

				{imageUrl && severity !== 'clear' && severity !== 'pending' && (
					<div
						style={{
							position: 'absolute',
							right: 6,
							bottom: 6,
							background: stripeColor,
							color: '#fff',
							fontSize: 9,
							letterSpacing: '0.04em',
							textTransform: 'uppercase',
							padding: '2px 6px',
							borderRadius: 2,
						}}
					>
						{SEVERITY_LABEL[severity]}
					</div>
				)}
			</HTMLContainer>
		)
	}

	getIndicatorPath(shape: ProofFrameShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}
