import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import TidesImportPanel from './TidesImportPanel.vue';

const importTidesMock = vi.fn();
vi.mock('../api/tidesAdmin', () => ({
  importTides: (...args: unknown[]) => importTidesMock(...args)
}));

describe('TidesImportPanel', () => {
  beforeEach(() => {
    importTidesMock.mockReset();
  });

  it('imports valid JSON and shows a success message', async () => {
    importTidesMock.mockResolvedValue({ ok: true, site: 'port-tudy', mode: 'merge', dates: 1, entries: 2 });
    const wrapper = mount(TidesImportPanel);

    await wrapper.find('#importJson').setValue('{"2026-11-01":[{"maree":"haute","heure":"06:10","hauteur":"4.70"}]}');
    await wrapper.find('button.btn-primary').trigger('click');
    await flushPromises();

    expect(importTidesMock).toHaveBeenCalledOnce();
    expect(importTidesMock).toHaveBeenCalledWith('port-tudy', 'merge', expect.any(Object));
    expect(wrapper.text()).toContain('Import réussi');
  });

  it('shows an error and does not call the API on invalid JSON', async () => {
    const wrapper = mount(TidesImportPanel);

    await wrapper.find('#importJson').setValue('{ not json');
    await wrapper.find('button.btn-primary').trigger('click');
    await flushPromises();

    expect(importTidesMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('JSON invalide');
  });

  it('surfaces a server error message', async () => {
    importTidesMock.mockRejectedValue(new Error('Aucune marée valide à importer.'));
    const wrapper = mount(TidesImportPanel);

    await wrapper.find('#importJson').setValue('{"2026-11-01":[]}');
    await wrapper.find('button.btn-primary').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Aucune marée valide');
  });
});
