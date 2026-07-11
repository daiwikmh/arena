import type { CSSProperties } from 'react'
import type { Finding } from '../lib/api'

interface ReviewPanelProps {
	findings: Finding[]
	totalCells: number
	repairingKey: string | null
	onRepair: (localeCode: string, formatId: string) => void
}

const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace'

function groupByCell(findings: Finding[]) {
	const groups = new Map<string, Finding[]>()
	for (const finding of findings) {
		const key = `${finding.locale_code}|${finding.format_id}`
		const list = groups.get(key) ?? []
		list.push(finding)
		groups.set(key, list)
	}
	return groups
}

export default function ReviewPanel({ findings, totalCells, repairingKey, onRepair }: ReviewPanelProps) {
	const groups = groupByCell(findings)
	const flaggedCells = groups.size
	const clearCells = Math.max(totalCells - flaggedCells, 0)
	const criticalCount = findings.filter((f) => f.severity === 'critical').length
	const warningCount = findings.filter((f) => f.severity === 'warning').length

	if (totalCells === 0) return null

	return (
		<aside
			style={{
				position: 'fixed',
				right: 0,
				top: 44,
				bottom: 0,
				width: 320,
				background: '#181C21',
				borderLeft: '1px solid #2C3238',
				display: 'flex',
				flexDirection: 'column',
				zIndex: 30,
				fontFamily: 'system-ui, -apple-system, sans-serif',
			}}
		>
			<div style={{ padding: '12px 14px 10px', borderBottom: '1px solid #2C3238' }}>
				<h2
					style={{
						margin: 0,
						fontSize: 12,
						letterSpacing: '0.09em',
						textTransform: 'uppercase',
						color: '#6B727A',
						fontWeight: 500,
					}}
				>
					Review queue
				</h2>
				<div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 8 }}>
					<span style={{ fontSize: 30, fontWeight: 300, color: '#E6E9EC', fontFamily: MONO }}>
						{flaggedCells}
					</span>
					<span style={{ fontSize: 12, color: '#9AA1A9' }}>of {totalCells} proofs need a human</span>
				</div>
				<div style={{ display: 'flex', gap: 12, marginTop: 8, fontFamily: MONO, fontSize: 10, color: '#6B727A' }}>
					<span>
						<i style={dotStyle('#E4635E')} />
						{criticalCount} critical
					</span>
					<span>
						<i style={dotStyle('#D99A2B')} />
						{warningCount} warning
					</span>
					<span>
						<i style={dotStyle('#4FA873')} />
						{clearCells} clear
					</span>
				</div>
			</div>

			<div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
				{groups.size === 0 && (
					<div style={{ padding: '28px 16px', textAlign: 'center', color: '#6B727A', fontSize: 12 }}>
						No findings yet. Fan out a campaign to populate the queue.
					</div>
				)}
				{Array.from(groups.entries()).map(([key, cellFindings]) => {
					const [localeCode, formatId] = key.split('|')
					const worst = cellFindings.some((f) => f.severity === 'critical') ? 'critical' : 'warning'
					const stripe = worst === 'critical' ? '#E4635E' : '#D99A2B'
					const isRepairing = repairingKey === key

					return (
						<div
							key={key}
							style={{
								background: '#1F242A',
								border: '1px solid #2C3238',
								borderLeft: `3px solid ${stripe}`,
								borderRadius: 3,
								padding: '9px 10px',
								marginBottom: 6,
							}}
						>
							<div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
								<span style={{ fontFamily: MONO, fontSize: 10.5, color: '#E6E9EC' }}>{key}</span>
								<span
									style={{
										marginLeft: 'auto',
										fontFamily: MONO,
										fontSize: 9,
										textTransform: 'uppercase',
										letterSpacing: '0.05em',
										color: stripe,
									}}
								>
									{worst}
								</span>
							</div>
							{cellFindings.map((finding, i) => (
								<p key={i} style={{ margin: '0 0 4px', fontSize: 11.5, color: '#9AA1A9', lineHeight: 1.42 }}>
									<strong style={{ color: '#E6E9EC', fontWeight: 500 }}>{finding.code}:</strong>{' '}
									{finding.message}
								</p>
							))}
							<button
								onClick={() => onRepair(localeCode, formatId)}
								disabled={isRepairing}
								style={{
									marginTop: 6,
									width: '100%',
									height: 26,
									border: '1px solid #3D444C',
									borderRadius: 3,
									background: isRepairing ? '#3D444C' : '#181C21',
									color: '#E6E9EC',
									fontSize: 11,
									cursor: isRepairing ? 'default' : 'pointer',
								}}
							>
								{isRepairing ? 'Repairing…' : 'Repair this proof'}
							</button>
						</div>
					)
				})}
			</div>
		</aside>
	)
}

function dotStyle(color: string): CSSProperties {
	return {
		display: 'inline-block',
		width: 6,
		height: 6,
		borderRadius: 1,
		background: color,
		marginRight: 4,
	}
}
