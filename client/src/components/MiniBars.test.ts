import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MiniBars from './MiniBars.vue';

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const TICKS = [
  { index: 0, text: 'lun' },
  { index: 6, text: 'dim' }
];

function mountBars(values: number[]) {
  return mount(MiniBars, { props: { values, labels: WEEKDAYS, ticks: TICKS, caption: 'Visites par jour' } });
}

describe('MiniBars', () => {
  it('rend une case par valeur', () => {
    expect(mountBars([1, 0, 0, 0, 0, 0, 3]).findAll('.mini-bars__slot')).toHaveLength(7);
  });

  it('met la plus grande valeur à pleine hauteur et les autres au prorata', () => {
    const bars = mountBars([2, 0, 0, 0, 0, 0, 4]).findAll('.mini-bars__bar');
    expect(bars[6].attributes('style')).toContain('height: 100%');
    expect(bars[0].attributes('style')).toContain('height: 50%');
  });

  it('laisse une case vide à zéro', () => {
    const bars = mountBars([0, 0, 0, 0, 0, 0, 4]).findAll('.mini-bars__bar');
    expect(bars[0].attributes('style')).toContain('height: 0%');
  });

  it('garde une valeur de 1 visible face à un maximum écrasant', () => {
    // Sans plancher, 1 sur 100 donnerait une barre d'un pixel, indiscernable de zéro.
    const bars = mountBars([1, 0, 0, 0, 0, 0, 100]).findAll('.mini-bars__bar');
    expect(bars[0].attributes('style')).toContain('height: 6%');
  });

  it('ne divise pas par zéro sur une série vide', () => {
    const bars = mountBars([0, 0, 0, 0, 0, 0, 0]).findAll('.mini-bars__bar');
    expect(bars.every(b => b.attributes('style')?.includes('height: 0%'))).toBe(true);
  });

  it('donne le détail en infobulle, au singulier comme au pluriel', () => {
    const slots = mountBars([1, 0, 0, 0, 0, 0, 3]).findAll('.mini-bars__slot');
    expect(slots[0].attributes('title')).toBe('lundi — 1 visite');
    expect(slots[6].attributes('title')).toBe('dimanche — 3 visites');
    expect(slots[1].attributes('title')).toBe('mardi — 0 visite');
  });

  it('n’affiche que les repères d’axe demandés, et décrit la série', () => {
    const wrapper = mountBars([1, 0, 0, 0, 0, 0, 3]);
    expect(wrapper.findAll('.mini-bars__axis span')).toHaveLength(2);
    expect(wrapper.find('.mini-bars').attributes('aria-label')).toBe('Visites par jour');
  });
});
