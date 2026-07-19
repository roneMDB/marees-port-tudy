import { describe, expect, it } from 'vitest';
import { computeNavihan, DEFAULT_OFFSETS, formatOffset, shiftTime } from './navihan';

describe('shiftTime', () => {
  it('adds an offset in minutes', () => {
    expect(shiftTime('08:21', 75)).toBe('09:36');
    expect(shiftTime('14:29', 160)).toBe('17:09');
  });

  it('wraps around midnight', () => {
    expect(shiftTime('23:15', 150)).toBe('01:45');
    expect(shiftTime('00:10', -20)).toBe('23:50');
  });
});

describe('computeNavihan', () => {
  it('gives basse mer + à flot for a low tide', () => {
    const nav = computeNavihan({ time: '14:29', type: 'low' }, DEFAULT_OFFSETS);
    expect(nav).toEqual({ 'Basse mer': '15:44', 'A flot': '17:09' });
  });

  it('gives only pleine mer for a high tide', () => {
    const nav = computeNavihan({ time: '08:21', type: 'high' }, DEFAULT_OFFSETS);
    expect(nav).toEqual({ 'Pleine mer': '09:36' });
  });

  it('honours custom, independent offsets', () => {
    const nav = computeNavihan({ time: '08:00', type: 'high' }, { basseMer: 60, pleineMer: 90, aFlot: 200 });
    expect(nav).toEqual({ 'Pleine mer': '09:30' });
  });
});

describe('formatOffset', () => {
  it('formats minutes as XhYY', () => {
    expect(formatOffset(75)).toBe('1h15');
    expect(formatOffset(160)).toBe('2h40');
    expect(formatOffset(120)).toBe('2h');
    expect(formatOffset(0)).toBe('0h');
  });
});
