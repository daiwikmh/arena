export type Intent = 'chat' | 'generate'

const CHAT_PATTERNS: RegExp[] = [
	/^\s*(hi|hey+|hello|yo|sup|hiya|hola|howdy|greetings)\b/i,
	/^\s*(good\s+(morning|afternoon|evening))\b/i,
	/^\s*(thanks|thank you|ty|cool|nice|ok|okay|great)\b\s*[.!]*\s*$/i,
	/what\s+can\s+you\s+do/i,
	/what\s+do\s+you\s+do/i,
	/who\s+are\s+you/i,
	/what\s+is\s+this/i,
	/how\s+(do|does|can)\s+(i|this|you|it)\b/i,
	/^\s*help\b\s*[?!.]*\s*$/i,
	/what\s+are\s+your\s+(capabilities|features)/i,
]

export function classifyIntent(text: string): Intent {
	return CHAT_PATTERNS.some((re) => re.test(text)) ? 'chat' : 'generate'
}

export function agentReply(_text: string): string {
	return (
		"I turn descriptions into shots. Try something like “a lone astronaut on a red dune at dusk, slow zoom in.” " +
		"I'll generate a keyframe with Nano Banana 2 Lite — approve it and I'll animate it into a clip with Omni Flash. " +
		'You can also attach a reference image to guide the look.'
	)
}
