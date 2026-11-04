import { describe, expect, it } from 'vitest';
import { csvField, toCsv } from './csv';

describe('csv', () => {
  describe('csvField', () => {
    it('returns empty string for null and undefined', () => {
      expect(csvField(null)).toBe('');
      expect(csvField(undefined)).toBe('');
    });

    it('returns plain string when no special characters present', () => {
      expect(csvField('hello')).toBe('hello');
      expect(csvField(123)).toBe('123');
    });

    it('escapes strings with quotes, commas, and newlines in RFC format', () => {
      expect(csvField('hello,world')).toBe('"hello,world"');
      expect(csvField('he said "hi"')).toBe('"he said ""hi"""');
      expect(csvField('line1\nline2')).toBe('"line1\nline2"');
      expect(csvField('line1\r\nline2')).toBe('"line1\r\nline2"');
    });

    it('mitigates CSV formula injection on triggers (=, +, -, @, \\t, \\r)', () => {
      expect(csvField('=1+1')).toBe("'=1+1");
      expect(csvField('+cmd|')).toBe("'+cmd|");
      expect(csvField('-123')).toBe("'-123");
      expect(csvField('@SUM(A1:A5)')).toBe("'@SUM(A1:A5)");
      expect(csvField('\tformula')).toBe("'\tformula");
    });
  });

  describe('toCsv', () => {
    it('prepends UTF-8 BOM and formats headers and rows into CSV with CRLF', () => {
      const headers = ['ID', 'Name', 'Notes'];
      const rows = [
        ['1', 'Anna', 'Normal text'],
        ['2', 'Oleg', 'Has, comma and "quotes"'],
      ];

      const csv = toCsv(headers, rows);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toBe('\uFEFFID,Name,Notes\r\n1,Anna,Normal text\r\n2,Oleg,"Has, comma and ""quotes"""\r\n');
    });
  });
});
