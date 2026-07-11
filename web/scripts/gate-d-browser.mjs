import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const [, , baseUrl, room, mode, ...rest] = process.argv

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForKey(cells, key, timeoutMs = 5000) {
	const deadline = Date.now() + timeoutMs
	while (!cells.has(key) && Date.now() < deadline) {
		await sleep(50)
	}
}

async function connect(baseUrl, room, doc) {
	const provider = new WebsocketProvider(baseUrl, room, doc, { WebSocketPolyfill: WebSocket })
	await new Promise((resolve) => {
		provider.once('sync', () => resolve())
	})
	return provider
}

async function runProduce(cellKey, cellValue, waitKey) {
	const doc = new Y.Doc()
	const cells = doc.getMap('cells')
	const provider = await connect(baseUrl, room, doc)

	if (waitKey) {
		await waitForKey(cells, waitKey)
	}

	doc.transact(() => {
		cells.set(cellKey, cellValue)
	}, 'user')

	await sleep(500)

	const final = Object.fromEntries(cells.entries())
	provider.destroy()
	doc.destroy()
	return final
}

async function runUndo(userCellKey, userCellValue, waitKey) {
	const doc = new Y.Doc()
	const cells = doc.getMap('cells')
	const undoManager = new Y.UndoManager(cells, { trackedOrigins: new Set(['user']) })

	const provider = await connect(baseUrl, room, doc)

	await waitForKey(cells, waitKey)

	doc.transact(() => {
		cells.set(userCellKey, userCellValue)
	}, 'user')

	await sleep(400)

	const beforeUndo = Object.fromEntries(cells.entries())
	undoManager.undo()
	await sleep(200)
	const afterUndo = Object.fromEntries(cells.entries())

	provider.destroy()
	doc.destroy()
	return { beforeUndo, afterUndo }
}

async function main() {
	let result
	if (mode === 'produce') {
		const [cellKey, cellValue, waitKey] = rest
		result = await runProduce(cellKey, cellValue, waitKey)
	} else if (mode === 'undo') {
		const [userCellKey, userCellValue, waitKey] = rest
		result = await runUndo(userCellKey, userCellValue, waitKey)
	} else {
		throw new Error(`unknown mode ${mode}`)
	}
	console.log(JSON.stringify(result))
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})
