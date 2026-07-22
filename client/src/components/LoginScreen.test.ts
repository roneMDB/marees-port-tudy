import { describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

const loginMock = vi.fn();
// De vrais refs : le template Vue ne déballe (unwrap) que les refs réels.
const errorRef = ref<string | null>(null);
const submittingRef = ref(false);

vi.mock('../composables/useAuth', () => ({
  useAuth: () => ({
    login: (u: string, p: string, r: boolean) => loginMock(u, p, r),
    error: errorRef,
    submitting: submittingRef
  })
}));

import LoginScreen from './LoginScreen.vue';

describe('LoginScreen', () => {
  it('affiche les champs identifiant et mot de passe', () => {
    const wrapper = mount(LoginScreen);
    expect(wrapper.find('input#login-user').exists()).toBe(true);
    expect(wrapper.find('input#login-password').exists()).toBe(true);
    expect(wrapper.text()).toContain('Marées Navihan');
  });

  it('soumet les identifiants saisis via useAuth.login', async () => {
    loginMock.mockResolvedValue(undefined);
    const wrapper = mount(LoginScreen);
    await wrapper.find('input#login-user').setValue('marees');
    await wrapper.find('input#login-password').setValue('s3cret');
    await wrapper.find('form').trigger('submit.prevent');
    await flushPromises();
    expect(loginMock).toHaveBeenCalledWith('marees', 's3cret', true); // « se souvenir » coché par défaut
  });

  it('affiche le message d\'erreur du composable', () => {
    errorRef.value = 'Identifiants invalides.';
    const wrapper = mount(LoginScreen);
    expect(wrapper.find('.alert-danger').text()).toContain('Identifiants invalides.');
    errorRef.value = null;
  });
});
