import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const listUsersMock = vi.fn();
const createUserMock = vi.fn();
const updateUserMock = vi.fn();
const deleteUserMock = vi.fn();

vi.mock('../api/users', () => ({
  listUsers: () => listUsersMock(),
  createUser: (l: string, p: string, r: string) => createUserMock(l, p, r),
  updateUser: (id: number, patch: unknown) => updateUserMock(id, patch),
  deleteUser: (id: number) => deleteUserMock(id)
}));

import UsersPanel from './UsersPanel.vue';

const sampleUsers = [
  { id: 1, login: 'admin', role: 'admin', mustChangePassword: false },
  { id: 2, login: 'bob', role: 'viewer', mustChangePassword: false }
];

afterEach(() => {
  listUsersMock.mockReset();
  createUserMock.mockReset();
  updateUserMock.mockReset();
  deleteUserMock.mockReset();
});

describe('UsersPanel', () => {
  it('charge et liste les utilisateurs au montage', async () => {
    listUsersMock.mockResolvedValue(sampleUsers);
    const wrapper = mount(UsersPanel);
    await flushPromises();
    expect(listUsersMock).toHaveBeenCalled();
    expect(wrapper.text()).toContain('admin');
    expect(wrapper.text()).toContain('bob');
  });

  it('crée un utilisateur puis recharge la liste', async () => {
    listUsersMock.mockResolvedValue(sampleUsers);
    createUserMock.mockResolvedValue({ id: 3, login: 'carol', role: 'viewer', mustChangePassword: false });
    const wrapper = mount(UsersPanel);
    await flushPromises();

    await wrapper.find('input[name="newLogin"]').setValue('carol');
    await wrapper.find('input[name="newPassword"]').setValue('secret123');
    await wrapper.find('form.users-add-form').trigger('submit.prevent');
    await flushPromises();

    expect(createUserMock).toHaveBeenCalledWith('carol', 'secret123', 'viewer');
    expect(listUsersMock).toHaveBeenCalledTimes(2); // montage + après création
  });

  it('réinitialise le mot de passe via un champ de saisie inline', async () => {
    listUsersMock.mockResolvedValue(sampleUsers);
    updateUserMock.mockResolvedValue({ ...sampleUsers[1] });
    const wrapper = mount(UsersPanel);
    await flushPromises();

    // Le champ n'est pas affiché tant qu'on n'a pas cliqué sur « réinitialiser ».
    expect(wrapper.find('input[name="resetPassword"]').exists()).toBe(false);

    await wrapper.find('[aria-label="Réinitialiser le mot de passe de bob"]').trigger('click');
    const field = wrapper.find('input[name="resetPassword"]');
    expect(field.exists()).toBe(true);

    await field.setValue('nouveaupass');
    await wrapper.find('form.reset-password-form').trigger('submit.prevent');
    await flushPromises();

    expect(updateUserMock).toHaveBeenCalledWith(2, { password: 'nouveaupass' });
    // Le champ se referme après succès.
    expect(wrapper.find('input[name="resetPassword"]').exists()).toBe(false);
  });

  it('supprime après confirmation par boutons (pas de window.confirm)', async () => {
    listUsersMock.mockResolvedValue(sampleUsers);
    deleteUserMock.mockResolvedValue(undefined);
    const wrapper = mount(UsersPanel);
    await flushPromises();

    // Aucune suppression tant qu'on n'a pas confirmé.
    await wrapper.find('[aria-label="Supprimer bob"]').trigger('click');
    expect(deleteUserMock).not.toHaveBeenCalled();

    // Un bouton de confirmation apparaît.
    const confirmBtn = wrapper.find('[aria-label="Confirmer la suppression de bob"]');
    expect(confirmBtn.exists()).toBe(true);

    await confirmBtn.trigger('click');
    await flushPromises();
    expect(deleteUserMock).toHaveBeenCalledWith(2);
    expect(listUsersMock).toHaveBeenCalledTimes(2); // montage + après suppression
  });

  it('annule la suppression sans appeler deleteUser', async () => {
    listUsersMock.mockResolvedValue(sampleUsers);
    const wrapper = mount(UsersPanel);
    await flushPromises();
    await wrapper.find('[aria-label="Supprimer bob"]').trigger('click');
    await wrapper.find('[aria-label="Annuler la suppression de bob"]').trigger('click');
    expect(wrapper.find('[aria-label="Confirmer la suppression de bob"]').exists()).toBe(false);
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('affiche une erreur si le chargement échoue', async () => {
    listUsersMock.mockRejectedValue(new Error('403 interdit'));
    const wrapper = mount(UsersPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('403 interdit');
  });
});
