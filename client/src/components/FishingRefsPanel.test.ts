import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const api = {
  getRefs: vi.fn(),
  addRef: vi.fn(),
  updateRef: vi.fn(),
  deleteRef: vi.fn(),
  resetRefs: vi.fn()
};

vi.mock('../api/fishing', () => ({
  getRefs: (...a: unknown[]) => api.getRefs(...a),
  addRef: (...a: unknown[]) => api.addRef(...a),
  updateRef: (...a: unknown[]) => api.updateRef(...a),
  deleteRef: (...a: unknown[]) => api.deleteRef(...a),
  resetRefs: (...a: unknown[]) => api.resetRefs(...a),
  getTrips: vi.fn(),
  createTrip: vi.fn(),
  updateTrip: vi.fn(),
  deleteTrip: vi.fn()
}));

import FishingRefsPanel from './FishingRefsPanel.vue';
import { resetFishingRefsForTests } from '../composables/useFishingRefs';

describe('FishingRefsPanel', () => {
  beforeEach(() => {
    Object.values(api).forEach(m => m.mockReset());
    api.getRefs.mockResolvedValue([
      { id: 'bar', kind: 'species', label: 'Bar', labelPlural: 'Bars' },
      { id: 'ligne', kind: 'gear', label: 'Ligne', labelPlural: 'Lignes' }
    ]);
    resetFishingRefsForTests();
  });

  it('liste les engins et les espèces dans deux sections', async () => {
    const wrapper = mount(FishingRefsPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('Engins');
    expect(wrapper.text()).toContain('Espèces');
    expect(wrapper.text()).toContain('Ligne');
    expect(wrapper.text()).toContain('Bar');
  });

  it('montre le pluriel de chaque entrée', async () => {
    const wrapper = mount(FishingRefsPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('Bars');
  });

  it('ajoute une espèce avec son pluriel', async () => {
    api.addRef.mockResolvedValue({
      id: 'homard',
      kind: 'species',
      label: 'Homard',
      labelPlural: 'Homards'
    });
    const wrapper = mount(FishingRefsPanel);
    await flushPromises();

    await wrapper.find('[data-test="new-label"]').setValue('Homard');
    await wrapper.find('[data-test="new-plural"]').setValue('Homards');
    await wrapper.find('[data-test="new-kind"]').setValue('species');
    await wrapper.find('[data-test="add-form"]').trigger('submit');
    await flushPromises();

    expect(api.addRef).toHaveBeenCalledWith('species', 'Homard', 'Homards');
    expect(wrapper.text()).toContain('Homards');
  });

  it('laisse le pluriel facultatif : le serveur le fera valoir le singulier', async () => {
    api.addRef.mockResolvedValue({
      id: 'epuisette',
      kind: 'gear',
      label: 'Épuisette',
      labelPlural: 'Épuisette'
    });
    const wrapper = mount(FishingRefsPanel);
    await flushPromises();

    await wrapper.find('[data-test="new-label"]').setValue('Épuisette');
    await wrapper.find('[data-test="new-kind"]').setValue('gear');
    await wrapper.find('[data-test="add-form"]').trigger('submit');
    await flushPromises();

    expect(api.addRef).toHaveBeenCalledWith('gear', 'Épuisette', '');
  });

  it('renomme une entrée, singulier et pluriel', async () => {
    api.updateRef.mockResolvedValue({
      id: 'bar',
      kind: 'species',
      label: 'Bar rayé',
      labelPlural: 'Bars rayés'
    });
    const wrapper = mount(FishingRefsPanel);
    await flushPromises();

    // Ciblage par id : les engins précèdent les espèces, le premier bouton n'est pas celui du bar.
    const row = wrapper.find('[data-test-ref="bar"]');
    await row.find('[data-test="edit"]').trigger('click');
    await row.find('[data-test="edit-label"]').setValue('Bar rayé');
    await row.find('[data-test="edit-plural"]').setValue('Bars rayés');
    await row.find('[data-test="edit-save"]').trigger('click');
    await flushPromises();

    expect(api.updateRef).toHaveBeenCalledWith('bar', 'Bar rayé', 'Bars rayés');
    expect(wrapper.text()).toContain('Bars rayés');
  });

  it('affiche le message du serveur quand une suppression est refusée (409)', async () => {
    api.deleteRef.mockRejectedValue(
      new Error(
        'Ce référentiel est utilisé par des prises enregistrées : il ne peut pas être supprimé.'
      )
    );
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const wrapper = mount(FishingRefsPanel);
    await flushPromises();

    await wrapper.findAll('[data-test="remove"]')[0].trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('utilisé par des prises enregistrées');
  });
});
