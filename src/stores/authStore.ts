import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserAccount } from '../types';
import { idbStorage } from '../lib/idbStorage';
import { shortId } from '../lib/utils/ids';

interface AuthState {
  users: UserAccount[];
  currentUser: UserAccount | null;
  setUsers: (users: UserAccount[]) => void;
  setCurrentUser: (user: UserAccount | null) => void;
  handleAddUser: (
    name: string,
    role: UserAccount['role'],
    pinHash: string,
    id?: string,
  ) => UserAccount;
  handleUpdateUser: (updatedUser: UserAccount) => void;
  handleDeleteUser: (id: string) => void;
}

// Development-only fixture accounts. Their legacy salted hashes are retained so
// the migration path is exercised; a successful login upgrades the hash to v2.
// Admin PIN 1234, Manager PIN 5555, Cashier PIN 0000.
const DEFAULT_USERS: UserAccount[] =
  import.meta.env.DEV || import.meta.env.MODE === 'test'
    ? [
        {
          id: 'u-1',
          name: 'Admin',
          role: 'admin',
          pin: '2efd4458fced12834fc6f39317faa5a689dde4ec088267d768a3b3b0193ccbcf',
          active: true,
          createdAt: '2023-01-01',
        },
        {
          id: 'u-2',
          name: 'Manager',
          role: 'manager',
          pin: '8690c9b4e9feb5cb74a13a8b3193c9a049d0f9cf01f631d257d472f0680b42be',
          active: true,
          createdAt: '2023-01-01',
        },
        {
          id: 'u-3',
          name: 'Cashier',
          role: 'cashier',
          pin: 'e103c0738bb6f7e2f6deb31424b25de795db8c477cb839745c19e41c20ec4396',
          active: true,
          createdAt: '2023-01-01',
        },
      ]
    : [];

/**
 * Staff accounts and who is signed in at this terminal. Persisted to IndexedDB
 * so a terminal stays usable, and signed in, across a restart.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: DEFAULT_USERS,
      currentUser: null,

      setUsers: (users) => set({ users }),
      setCurrentUser: (user) => set({ currentUser: user }),

      handleAddUser: (name, role, pinHash, id?) => {
        const newUser: UserAccount = {
          id: id || `user-${shortId()}`,
          name,
          role,
          pin: pinHash,
          active: true,
          createdAt: new Date().toISOString(),
        };
        set({ users: [...get().users, newUser] });
        return newUser;
      },

      handleUpdateUser: (updatedUser) => {
        set({
          users: get().users.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
        });
      },

      handleDeleteUser: (id) => {
        set({
          users: get().users.filter((u) => u.id !== id),
        });
      },
    }),
    {
      name: 'pos-auth-storage',
      storage: createJSONStorage(() => idbStorage),
      // The signed-in operator is intentionally NOT persisted: restarting the
      // terminal must always return to the lock screen.
      partialize: (state) => ({ users: state.users }),
      // v1 strips currentUser from blobs written before partialize existed —
      // otherwise an old install would auto-unlock once more after upgrading.
      version: 1,
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Partial<AuthState>;
        return { users: state.users ?? DEFAULT_USERS };
      },
    },
  ),
);
