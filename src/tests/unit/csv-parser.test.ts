import { describe, expect, it } from 'vitest';
import { parseCsv } from '../../lib/server/sources/csv-parser';

describe('parseCsv', () => {
	it('keeps delimiters and escaped quotes inside quoted fields', () => {
		const rows = parseCsv('A;B;C\n"foo;bar";"he said ""hi""";baz');

		expect(rows).toEqual([
			{ A: 'foo;bar', B: 'he said "hi"', C: 'baz' }
		]);
	});

	it('handles CRLF rows and missing trailing values', () => {
		const rows = parseCsv('A;B;C\r\none;two;');

		expect(rows).toEqual([
			{ A: 'one', B: 'two', C: '' }
		]);
	});
});