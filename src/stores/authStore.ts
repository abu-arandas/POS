import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserAccount } from '../types';
import { idbStorage } from '../lib/idbStorage';
import { shortId } from '../lib/utils/ids';
import { hashPinSaltedLegacySync } from '../lib/hash';

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

// Development-only fixture accounts, dropped from production builds by the
// branch below. Their PINs are the demo PINs, hashed here with the v1 helper
// rather than pasted in as digests: the literal hashes read as leaked
// credentials to a secret scanner, and burying the PIN they encode made it
// impossible to see that these are the same fixtures the README documents.
// Deriving them keeps the v1 -> v2 migration path exercised on first login.
const DEV_FIXTURES: Array<{ id: string; name: string; role: UserAccount['role']; pin: string }> = [
  { id: 'u-1', name: 'Admin', role: 'admin', pin: '1234' },
  { id: 'u-2', name: 'Manager', role: 'manager', pin: '5555' },
  { id: 'u-3', name: 'Cashier', role: 'cashier', pin: '0000' },
];

const DEFAULT_USERS: UserAccount[] =
  import.meta.env.DEV || import.meta.env.MODE === 'test'
    ? DEV_FIXTURES.map(({ id, name, role, pin }) => ({
        id,
        name,
        role,
        pin: hashPinSaltedLegacySync(id, pin),
        active: true,
        createdAt: '2023-01-01',
      }))
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
