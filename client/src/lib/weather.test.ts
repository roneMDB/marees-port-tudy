import { describe, expect, it } from 'vitest';
import { degToCompass, resolveLinkUrl, wmoIcon } from './weather';

describe('degToCompass', () => {
  it('maps degrees to an 8-point French compass', () => {
    expect(degToCompass(0)).toBe('N');
    expect(degToCompass(90)).toBe('E');
    expect(degToCompass(180)).toBe('S');
    expect(degToCompass(225)).toBe('SO');
    expect(degToCompass(360)).toBe('N'); // wrap
  });
});

describe('wmoIcon', () => {
  it('maps WMO codes to bootstrap icons', () => {
    expect(wmoIcon(0)).toBe('bi-sun');
    expect(wmoIcon(3)).toBe('bi-clouds');
    expect(wmoIcon(63)).toBe('bi-cloud-rain');
    expect(wmoIcon(95)).toBe('bi-cloud-lightning-rain');
    expect(wmoIcon(4)).toBe('bi-cloud'); // code non mappé → défaut
  });
});

describe('resolveLinkUrl', () => {
  it('substitutes {lat}/{lon} with the coordinates', () => {
    expect(resolveLinkUrl('https://www.windy.com/?{lat},{lon},9', 47.64, -3.45)).toBe(
      'https://www.windy.com/?47.64,-3.45,9'
    );
  });

  it('leaves URLs without placeholders unchanged', () => {
    expect(resolveLinkUrl('https://open-meteo.com', 47.64, -3.45)).toBe('https://open-meteo.com');
  });

  it('replaces placeholders with empty string when coordinates are missing', () => {
    expect(resolveLinkUrl('https://x/?{lat},{lon}')).toBe('https://x/?,');
  });
});
