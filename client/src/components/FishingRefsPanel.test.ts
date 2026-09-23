import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';

const api = {
  getRefs: vi.fn(),
  addRef: vi.fn(),
  updateRef: vi.fn(),
  deleteRef: vi.fn(),
  reorderRefs: vi.fn(),
  resetRefs: vi.fn()
};

vi.mock('../api/fishing', () => ({
  getRefs: (...a: unknown[]) => api.getRefs(...a),
  addRef: (...a: unknown[]) => api.addRef(...a),
  updateRef: (...a: unknown[]) => api.updateRef(...a),
  deleteRef: (...a: unknown[]) => api.deleteRef(...a),
  reorderRefs: (...a: unknown[]) => api.reorderRefs(...a),
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
      { id: 'ligne', kind: 'gear', label: 'Ligne', labelPlural: 'Lignes' },
      { id: 'casier', kind: 'gear', label: 'Casier', labelPlural: 'Casiers' },
      { id: 'bar', kind: 'species', label: 'Bar', labelPlural: 'Bars' },
      { id: 'tourteau', kind: 'species', label: 'Tourteau', labelPlural: 'Tourteaux', defaultGearId: 'casier' },
      { id: 'seiche', kind: 'species', label: 'Seiche', labelPlural: 'Seiches' }
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

    expect(api.addRef).toHaveBeenCalledWith('species', 'Homard', 'Homards', null);
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

    expect(api.addRef).toHaveBeenCalledWith('gear', 'Épuisette', '', null);
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

    expect(api.updateRef).toHaveBeenCalledWith('bar', 'Bar rayé', 'Bars rayés', null);
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

  describe('ordre des entrées', () => {
    const dispo = (w: ReturnType<typeof mount>, id: string, sens: 'up' | 'down') =>
      !(w.find(`[data-test-ref="${id}"] [data-test="${sens}"]`).element as HTMLButtonElement).disabled;

    it('descend une espèce dans sa section, sans toucher aux engins', async () => {
      api.reorderRefs.mockResolvedValue([]);
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();

      await wrapper.find('[data-test-ref="bar"] [data-test="down"]').trigger('click');
      await flushPromises();
      expect(api.reorderRefs).toHaveBeenCalledWith('species', ['tourteau', 'bar', 'seiche']);
    });

    it('monte une espèce', async () => {
      api.reorderRefs.mockResolvedValue([]);
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();

      await wrapper.find('[data-test-ref="seiche"] [data-test="up"]').trigger('click');
      await flushPromises();
      expect(api.reorderRefs).toHaveBeenCalledWith('species', ['bar', 'seiche', 'tourteau']);
    });

    it('réordonne les engins entre eux, avec leur propre section pour bornes', async () => {
      api.reorderRefs.mockResolvedValue([]);
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();

      await wrapper.find('[data-test-ref="ligne"] [data-test="down"]').trigger('click');
      await flushPromises();
      expect(api.reorderRefs).toHaveBeenCalledWith('gear', ['casier', 'ligne']);
    });

    it('désactive les flèches aux extrémités de chaque section', async () => {
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();

      // Espèces : bar (1re) et seiche (dernière).
      expect(dispo(wrapper, 'bar', 'up')).toBe(false);
      expect(dispo(wrapper, 'bar', 'down')).toBe(true);
      expect(dispo(wrapper, 'seiche', 'down')).toBe(false);
      // Engins : ligne est 1re de SA section, même si des espèces la suivent.
      expect(dispo(wrapper, 'ligne', 'up')).toBe(false);
      expect(dispo(wrapper, 'casier', 'down')).toBe(false);
    });

    it('affiche le message du serveur quand le tri est refusé', async () => {
      api.reorderRefs.mockRejectedValue(new Error('Liste périmée'));
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();

      await wrapper.find('[data-test-ref="bar"] [data-test="down"]').trigger('click');
      await flushPromises();
      expect(wrapper.text()).toContain('Liste périmée');
    });
  });

  describe('engin par défaut', () => {
    it('affiche l’engin par défaut à côté de l’espèce', async () => {
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      expect(wrapper.find('[data-test-ref="tourteau"] [data-test="default-gear"]').text()).toContain('Casier');
      expect(wrapper.find('[data-test-ref="bar"] [data-test="default-gear"]').exists()).toBe(false);
    });

    it('propose le choix à l’ajout d’une espèce, pas d’un engin', async () => {
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      expect(wrapper.find('[data-test="new-default-gear"]').exists()).toBe(true);
      await wrapper.find('[data-test="new-kind"]').setValue('gear');
      expect(wrapper.find('[data-test="new-default-gear"]').exists()).toBe(false);
    });

    it('envoie l’engin par défaut choisi à l’ajout', async () => {
      api.addRef.mockResolvedValue({
        id: 'morgate',
        kind: 'species',
        label: 'Morgate',
        labelPlural: 'Morgates',
        defaultGearId: 'casier'
      });
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      await wrapper.find('[data-test="new-label"]').setValue('Morgate');
      await wrapper.find('[data-test="new-default-gear"]').setValue('casier');
      await wrapper.find('[data-test="add-form"]').trigger('submit');
      await flushPromises();
      expect(api.addRef).toHaveBeenCalledWith('species', 'Morgate', '', 'casier');
    });

    it('modifie l’engin par défaut d’une espèce, sélecteur prérempli', async () => {
      api.updateRef.mockResolvedValue({
        id: 'tourteau',
        kind: 'species',
        label: 'Tourteau',
        labelPlural: 'Tourteaux',
        defaultGearId: 'ligne'
      });
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      const row = wrapper.find('[data-test-ref="tourteau"]');
      await row.find('[data-test="edit"]').trigger('click');
      const select = row.find('[data-test="edit-default-gear"]');
      expect((select.element as HTMLSelectElement).value).toBe('casier');
      await select.setValue('ligne');
      await row.find('[data-test="edit-save"]').trigger('click');
      await flushPromises();
      expect(api.updateRef).toHaveBeenCalledWith('tourteau', 'Tourteau', 'Tourteaux', 'ligne');
    });

    it('« aucun » envoie null', async () => {
      api.updateRef.mockResolvedValue({
        id: 'tourteau',
        kind: 'species',
        label: 'Tourteau',
        labelPlural: 'Tourteaux',
        defaultGearId: null
      });
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      const row = wrapper.find('[data-test-ref="tourteau"]');
      await row.find('[data-test="edit"]').trigger('click');
      await row.find('[data-test="edit-default-gear"]').setValue('');
      await row.find('[data-test="edit-save"]').trigger('click');
      await flushPromises();
      expect(api.updateRef).toHaveBeenCalledWith('tourteau', 'Tourteau', 'Tourteaux', null);
    });

    it('ne propose pas d’engin par défaut à l’édition d’un engin', async () => {
      const wrapper = mount(FishingRefsPanel);
      await flushPromises();
      const row = wrapper.find('[data-test-ref="ligne"]');
      await row.find('[data-test="edit"]').trigger('click');
      expect(row.find('[data-test="edit-default-gear"]').exists()).toBe(false);
    });
  });
});
