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
  });

  describe('toCsv', () => {
    it('formats headers and rows into CSV with CRLF line breaks', () => {
      const headers = ['ID', 'Name', 'Notes'];
      const rows = [
        ['1', 'Anna', 'Normal text'],
        ['2', 'Oleg', 'Has, comma and "quotes"'],
      ];

      const csv = toCsv(headers, rows);
      expect(csv).toBe('ID,Name,Notes\r\n1,Anna,Normal text\r\n2,Oleg,"Has, comma and ""quotes"""\r\n');
    });
  });
});
