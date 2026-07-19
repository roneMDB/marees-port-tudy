import { describe, expect, it } from 'vitest';
import { formatClock } from './clock';

describe('formatClock', () => {
  it('combines a French date and a HH:MM:SS time', () => {
    const s = formatClock(new Date('2026-07-19T15:48:54'));
    expect(s).toContain(' · 15:48:54');
    expect(s).toContain('2026');
    expect(s).toContain('19');
  });

  it('zero-pads hours, minutes and seconds', () => {
    const s = formatClock(new Date('2026-01-05T09:03:07'));
    expect(s).toContain(' · 09:03:07');
  });
});
