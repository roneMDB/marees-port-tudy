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

  it('affiche une erreur si le chargement échoue', async () => {
    listUsersMock.mockRejectedValue(new Error('403 interdit'));
    const wrapper = mount(UsersPanel);
    await flushPromises();
    expect(wrapper.text()).toContain('403 interdit');
  });
});
