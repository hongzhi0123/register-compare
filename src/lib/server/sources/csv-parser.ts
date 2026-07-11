export function parseCsv(text: string, delimiter: string = ';'): Record<string, string>[] {
	const lines = splitCsvLines(text);
	if (lines.length === 0) return [];

	const headers = parseCsvLine(lines[0], delimiter).map((h) => h.trim());
	const rows: Record<string, string>[] = [];

	for (let i = 1; i < lines.length; i++) {
		const values = parseCsvLine(lines[i], delimiter);
		const row: Record<string, string> = {};
		for (let j = 0; j < headers.length; j++) {
			row[headers[j]] = values[j]?.trim() ?? '';
		}
		rows.push(row);
	}

	return rows;
}

function splitCsvLines(text: string): string[] {
	const lines: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];

		if (inQuotes) {
			current += ch;
			if (ch === '"') {
				if (i + 1 < text.length && text[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			}
		} else if (ch === '"') {
			current += ch;
			inQuotes = true;
		} else if (ch === '\n') {
			lines.push(current);
			current = '';
		} else if (ch === '\r') {
			// skip
		} else {
			current += ch;
		}
	}

	if (current) lines.push(current);
	return lines;
}

function parseCsvLine(line: string, delimiter: string): string[] {
	const values: string[] = [];
	let current = '';
	let inQuotes = false;

	for (let i = 0; i < line.length; i++) {
		const ch = line[i];

		if (inQuotes) {
			if (ch === '"') {
				if (i + 1 < line.length && line[i + 1] === '"') {
					current += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				current += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === delimiter) {
			values.push(current);
			current = '';
		} else {
			current += ch;
		}
	}

	values.push(current);
	return values;
}
