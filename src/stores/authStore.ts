import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { UserAccount } from '../types';
import { idbStorage } from '../lib/idbStorage';
import { hashPin } from '../lib/hash';

interface AuthState {
  users: UserAccount[];
  currentUser: UserAccount | null;
  setUsers: (users: UserAccount[]) => void;
  setCurrentUser: (user: UserAccount | null) => void;
  handleAddUser: (name: string, role: UserAccount['role'], pinHash: string) => void;
  handleUpdateUser: (updatedUser: UserAccount) => void;
  handleDeleteUser: (id: string) => void;
}

// Pre-hashed (SHA-256) default PINs for seed data (Admin 1234, Manager 5555, Cashier 0000)
const DEFAULT_USERS: UserAccount[] = [
  {
    id: 'u-1',
    name: 'Admin',
    role: 'admin',
    pin: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
    active: true,
    createdAt: '2023-01-01',
  },
  {
    id: 'u-2',
    name: 'Manager',
    role: 'manager',
    pin: 'c1f330d0aff31c1c87403f1e4347bcc21aff7c179908723535f2b31723702525',
    active: true,
    createdAt: '2023-01-01',
  },
  {
    id: 'u-3',
    name: 'Cashier',
    role: 'cashier',
    pin: '9af15b336e6a9619928537df30b2e6a2376569fcf9d7e773eccede65606529a0',
    active: true,
    createdAt: '2023-01-01',
  },
];

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      users: DEFAULT_USERS,
      currentUser: null,

      setUsers: (users) => set({ users }),
      setCurrentUser: (user) => set({ currentUser: user }),

      handleAddUser: (name, role, pinHash) => {
        const newUser: UserAccount = {
          id: `user-${Math.floor(1000 + Math.random() * 9000)}`,
          name,
          role,
          pin: pinHash,
          active: true,
          createdAt: new Date().toISOString(),
        };
        set({ users: [...get().users, newUser] });
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
    },
  ),
);
