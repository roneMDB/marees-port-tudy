import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { flushPromises } from '@vue/test-utils';
import EphemerideCard from './EphemerideCard.vue';
import { useEphemeride } from '../composables/useEphemeride';
import { resetWeatherForTests } from '../composables/useWeather';
import { getWeather } from '../api/weather';
import type { Weather } from '../types';

vi.mock('../api/weather', () => ({ getWeather: vi.fn() }));

const weather = {
  location: { latitude: 47.677, longitude: -3.166, timezone: 'Europe/Paris' },
  units: { temperature: '°C', wind: 'km/h', precipitation: 'mm', wave: 'm', wavePeriod: 's' },
  current: {
    time: '2026-07-30T12:00',
    temperature: 22,
    apparentTemperature: 22,
    weatherCode: 0,
    weatherText: 'Ciel clair',
    windSpeed: 18,
    windGusts: 30,
    windDirection: 225,
    precipitation: 0
  },
  daily: [
    {
      date: '2026-07-30',
      weatherCode: 0,
      weatherText: 'Ciel clair',
      tempMin: 15,
      tempMax: 24,
      precipitation: 0,
      windMax: 22,
      gustMax: 35,
      windDirection: 225,
      uvIndexMax: 6.95
    }
  ],
  marine: {
    current: { time: '2026-07-30T12:00', waveHeight: 0.4, wavePeriod: 5, waveDirection: 270, seaTemperature: 21.3 },
    daily: [{ date: '2026-07-30', waveHeightMax: 0.5, wavePeriodMax: 5.2, seaTemperatureMax: 21.6 }]
  }
} satisfies Weather;

const tile = (w: ReturnType<typeof mount>, name: string) => w.get(`[data-tile="${name}"]`).text();
const wrapperSup = (w: ReturnType<typeof mount>) => w.get('[data-tile="calendrier"] sup').text();

async function mountCard(): Promise<ReturnType<typeof mount>> {
  const wrapper = mount(EphemerideCard);
  await flushPromises();
  return wrapper;
}

describe('EphemerideCard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Jeudi 30 juillet 2026 : 211ᵉ jour, semaine 31, sainte Juliette, gibbeuse décroissante.
    vi.setSystemTime(new Date('2026-07-30T10:00:00'));
    resetWeatherForTests();
    localStorage.clear();
    useEphemeride().show();
    vi.mocked(getWeather).mockResolvedValue(weather);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('affiche le soleil : lever, coucher, durée et midi solaire', async () => {
    const text = tile(await mountCard(), 'soleil');
    expect(text).toContain('06:4'); // lever ~06:47 (référence Open-Meteo)
    expect(text).toContain('21:5'); // coucher ~21:50
    expect(text).toContain('de jour');
    expect(text).toContain('midi solaire');
  });

  it('indique le sens de variation de la durée du jour', async () => {
    // Fin juillet, le jour raccourcit : le signe doit être négatif.
    expect(tile(await mountCard(), 'soleil')).toMatch(/−\d+ min/);
  });

  it('affiche la phase de lune et la prochaine syzygie', async () => {
    const text = tile(await mountCard(), 'lune');
    expect(text).toContain('Gibbeuse décroissante');
    expect(text).toContain('% éclairée');
    expect(text).toContain('Nouvelle lune dans 13 j');
  });

  it('n’annonce pas les vives-eaux loin d’une syzygie', async () => {
    expect(tile(await mountCard(), 'lune')).not.toContain('vives-eaux');
  });

  it('annonce les vives-eaux à l’approche d’une syzygie', async () => {
    // Nouvelle lune le 12 août : à deux jours, l'annonce a un sens.
    vi.setSystemTime(new Date('2026-08-10T10:00:00'));
    expect(tile(await mountCard(), 'lune')).toContain('vives-eaux à suivre');
  });

  it('affiche le quantième, la semaine et le saint du jour', async () => {
    const text = tile(await mountCard(), 'calendrier');
    expect(text).toContain('211');
    expect(text).toContain('jour / 365');
    expect(text).toContain('sem. 31');
    expect(text).toContain('Sainte Juliette');
  });

  it('ne met la majuscule qu’au premier mot de la date', async () => {
    // En français le mois s'écrit en minuscules : « Jeudi 30 juillet », pas « Jeudi 30 Juillet »
    // (ce que produisait `text-capitalize`).
    expect(tile(await mountCard(), 'calendrier')).toContain('Jeudi 30 juillet');
  });

  it('n’affiche la date qu’une fois dans la carte', async () => {
    const wrapper = await mountCard();
    const occurrences = wrapper.text().match(/30 juillet/gi) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it('note le quantième avec un exposant simple', async () => {
    // `<sup>` fait déjà l'exposant : y mettre « ᵉ » le doublerait et donnerait « 211˚ ».
    expect(wrapperSup(await mountCard())).toBe('e');
  });

  it('affiche la température de l’eau et l’indice UV venus de la météo', async () => {
    const text = tile(await mountCard(), 'mer');
    expect(text).toContain('21.3');
    expect(text).toContain('°C');
    expect(text).toContain('7'); // UV 6,95 arrondi
  });

  it('ne charge la météo qu’une fois, même montée en double', async () => {
    await mountCard();
    await mountCard();
    expect(vi.mocked(getWeather)).toHaveBeenCalledTimes(1);
  });

  it('reste renseignée hors-ligne, sauf eau et UV', async () => {
    vi.mocked(getWeather).mockRejectedValue(new Error('hors ligne'));
    const wrapper = await mountCard();
    // Le soleil, la lune et le calendrier sont calculés localement.
    expect(tile(wrapper, 'soleil')).toContain('06:4');
    expect(tile(wrapper, 'lune')).toContain('Gibbeuse décroissante');
    expect(tile(wrapper, 'calendrier')).toContain('Sainte Juliette');
    // La tuile Mer se replie sur « — » sans casser la carte.
    expect(tile(wrapper, 'mer')).toContain('—');
  });

  it('se replie et se déplie sans masquer la carte', async () => {
    const wrapper = await mountCard();
    const header = wrapper.get('button[aria-expanded]');
    expect(header.attributes('aria-expanded')).toBe('true');
    await header.trigger('click');
    expect(header.attributes('aria-expanded')).toBe('false');
    // Le repli est visuel (`v-show`) : la carte reste montée.
    expect(wrapper.find('[data-tile="soleil"]').exists()).toBe(true);
  });

  it('se masque et propose de la rétablir', async () => {
    const wrapper = await mountCard();
    await wrapper.get('button[aria-label="Masquer l\'éphéméride"]').trigger('click');
    expect(wrapper.find('[data-tile="soleil"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("Afficher l'éphéméride");

    await wrapper.get('button').trigger('click');
    expect(wrapper.find('[data-tile="soleil"]').exists()).toBe(true);
  });

  it('persiste le masquage', async () => {
    const wrapper = await mountCard();
    await wrapper.get('button[aria-label="Masquer l\'éphéméride"]').trigger('click');
    expect(localStorage.getItem('marees-ephemeride')).toBe('hidden');
  });
});
