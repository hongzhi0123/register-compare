type ObjMarker = { startPos: number; startDepth: number };

/**
 * Reads a ReadableStream and yields every complete JSON object `{...}`
 * as a parsed JavaScript object, regardless of nesting depth.
 *
 * Memory is bounded by the single largest object in the stream.
 */
export async function* extractJsonObjects(
	webStream: ReadableStream
): AsyncGenerator<Record<string, unknown>> {
	const reader = webStream.getReader();
	const decoder = new TextDecoder();

	let buffer = '';
	let pos = 0;
	let braceDepth = 0;
	let inString = false;
	let escape = false;
	let objStack: ObjMarker[] = [];

	let logRaw = true;

	while (true) {
		const { done, value } = await reader.read();
		const chunk = decoder.decode(value ?? new Uint8Array(), { stream: !done });
		buffer += chunk;

		if (logRaw) {
			console.error('[JSON] raw start:', JSON.stringify(buffer.slice(0, 500)));
			logRaw = false;
		}

		for (; pos < buffer.length; pos++) {
			const ch = buffer[pos];

			if (escape) { escape = false; continue; }
			if (ch === '\\' && inString) { escape = true; continue; }
			if (ch === '"') { inString = !inString; continue; }
			if (inString) continue;

			if (ch === '{') {
				objStack.push({ startPos: pos, startDepth: braceDepth });
				braceDepth++;
			} else if (ch === '}') {
				braceDepth--;
				const last = objStack[objStack.length - 1];
				if (last && braceDepth === last.startDepth) {
					objStack.pop();
					const objStr = buffer.slice(last.startPos, pos + 1);
					try {
						const raw = JSON.parse(objStr);
						if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
							yield raw as Record<string, unknown>;
						}
					} catch {
						// skip malformed objects
					}
				}
			}
		}

		if (objStack.length === 0) {
			buffer = '';
			pos = 0;
		} else {
			const first = objStack[0].startPos;
			if (first > 0) {
				buffer = buffer.slice(first);
				pos -= first;
				for (const m of objStack) m.startPos -= first;
			}
		}

		if (done) break;
	}
}
