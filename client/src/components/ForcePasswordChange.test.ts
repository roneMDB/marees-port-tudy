import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const changeMyPasswordMock = vi.fn();
const checkStatusMock = vi.fn();

vi.mock('../api/users', () => ({
  changeMyPassword: (c: string, n: string) => changeMyPasswordMock(c, n)
}));
vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({ checkStatus: checkStatusMock, logout: vi.fn() })
}));

import ForcePasswordChange from './ForcePasswordChange.vue';

afterEach(() => {
  changeMyPasswordMock.mockReset();
  checkStatusMock.mockReset();
});

describe('ForcePasswordChange', () => {
  it('refuse si la confirmation ne correspond pas', async () => {
    const wrapper = mount(ForcePasswordChange);
    await wrapper.find('input[name="current"]').setValue('old');
    await wrapper.find('input[name="next"]').setValue('newpassword');
    await wrapper.find('input[name="confirm"]').setValue('different');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(changeMyPasswordMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toMatch(/ne correspond/i);
  });

  it('change le mot de passe puis réhydrate le statut', async () => {
    changeMyPasswordMock.mockResolvedValue({ ok: true });
    const wrapper = mount(ForcePasswordChange);
    await wrapper.find('input[name="current"]').setValue('old');
    await wrapper.find('input[name="next"]').setValue('newpassword');
    await wrapper.find('input[name="confirm"]').setValue('newpassword');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(changeMyPasswordMock).toHaveBeenCalledWith('old', 'newpassword');
    expect(checkStatusMock).toHaveBeenCalled();
  });

  it('affiche l’erreur serveur si le mot de passe actuel est faux', async () => {
    changeMyPasswordMock.mockRejectedValue(new Error('Mot de passe actuel incorrect.'));
    const wrapper = mount(ForcePasswordChange);
    await wrapper.find('input[name="current"]').setValue('wrong');
    await wrapper.find('input[name="next"]').setValue('newpassword');
    await wrapper.find('input[name="confirm"]').setValue('newpassword');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(wrapper.text()).toContain('Mot de passe actuel incorrect.');
  });
});
