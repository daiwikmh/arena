import type { FormatSpec, LocaleSpec } from './api'

const MAX_SIDE = 200
const GAP = 24

export interface CellRect {
	x: number
	y: number
	w: number
	h: number
}

export function layoutGrid(
	locales: LocaleSpec[],
	formats: FormatSpec[],
): Map<string, CellRect> {
	const dims = formats.map((fmt) => {
		const scale = MAX_SIDE / Math.max(fmt.width_ratio, fmt.height_ratio)
		return { id: fmt.id, w: fmt.width_ratio * scale, h: fmt.height_ratio * scale }
	})

	const colX: number[] = []
	let x = 0
	for (const d of dims) {
		colX.push(x)
		x += d.w + GAP
	}
	const rowH = Math.max(...dims.map((d) => d.h), 0)

	const rects = new Map<string, CellRect>()
	locales.forEach((locale, rowIdx) => {
		formats.forEach((fmt, colIdx) => {
			const d = dims[colIdx]
			rects.set(`${locale.code}|${fmt.id}`, {
				x: colX[colIdx],
				y: rowIdx * (rowH + GAP),
				w: d.w,
				h: d.h,
			})
		})
	})
	return rects
}
