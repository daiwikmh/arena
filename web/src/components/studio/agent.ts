import type { ModelTarget } from './types'

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

// Words that mean "use the video model" (Omni Flash → animate a clip)
const VIDEO_PATTERNS: RegExp[] = [
	/\banimat(e|ed|ing|ion)\b/i,
	/\b(motion|moving|move|movement)\b/i,
	/\bvideo\b/i,
	/\bclip\b/i,
	/\bfootage\b/i,
	/\bcinemagraph\b/i,
	/\b(time\s?-?lapse|slow\s?-?mo(tion)?)\b/i,
	/\bloop(ing)?\b/i,
	/\bbring\s+(it|them|this|her|him)\s+to\s+life\b/i,
	/\bmake\s+(it|them|this)\s+move\b/i,
]

// Words that mean "use the image model" (Nano Banana 2 Lite → keyframe)
const IMAGE_PATTERNS: RegExp[] = [
	/\b(image|photo|photograph|picture|still|keyframe|poster|portrait|render|illustration|painting)\b/i,
]

export function classifyIntent(text: string): Intent {
	return CHAT_PATTERNS.some((re) => re.test(text)) ? 'chat' : 'generate'
}

/**
 * Pick the model straight from the prompt. Video wins when both appear
 * ("animate this photo" → clip). Returns null when the prompt gives no signal,
 * so the caller can fall back to the currently selected model.
 */
export function detectModel(text: string): ModelTarget | null {
	if (VIDEO_PATTERNS.some((re) => re.test(text))) return 'clip'
	if (IMAGE_PATTERNS.some((re) => re.test(text))) return 'keyframe'
	return null
}

export function agentReply(_text: string): string {
	return (
		"I turn descriptions into shots. Try something like “a lone astronaut on a red dune at dusk, slow zoom in.” " +
		"I pick the model from your words — say “image / photo” for a keyframe (Nano Banana 2 Lite), or “animate / video / make it move” " +
		'and I’ll switch to Omni Flash to bring it to life. You can also attach a reference image to guide the look.'
	)
}
