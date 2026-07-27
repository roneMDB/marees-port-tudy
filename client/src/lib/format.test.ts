import { describe, expect, it } from 'vitest';
import { relativeDayLabel } from './format';

describe('relativeDayLabel', () => {
  const today = '2026-07-26';

  it('names today and tomorrow in words', () => {
    expect(relativeDayLabel(today, today)).toBe("aujourd'hui");
    expect(relativeDayLabel('2026-07-27', today)).toBe('demain');
  });

  it('falls back to the formatted date beyond tomorrow', () => {
    expect(relativeDayLabel('2026-07-28', today)).toBe('mar. 28 juil.');
  });

  it('crosses month and year boundaries', () => {
    expect(relativeDayLabel('2026-08-01', '2026-07-31')).toBe('demain');
    expect(relativeDayLabel('2027-01-01', '2026-12-31')).toBe('demain');
  });

  it('falls back to the formatted date for a past day', () => {
    expect(relativeDayLabel('2026-07-25', today)).toBe('sam. 25 juil.');
  });
});
