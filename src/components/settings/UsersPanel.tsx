import type { TFunction } from 'i18next';
import { Edit2, Trash2, UserPlus, Users } from 'lucide-react';
import type { UserAccount } from '../../types';

export interface UsersPanelProps {
  t: TFunction;
  users: UserAccount[];
  currentUser: UserAccount | null;
  onAddUser(): void;
  onEditUser(user: UserAccount): void;
  onRemoveUser(user: UserAccount): void | Promise<void>;
}

export function UsersPanel({
  t,
  users,
  currentUser,
  onAddUser,
  onEditUser,
  onRemoveUser,
}: UsersPanelProps) {
  const roleLabel: Record<UserAccount['role'], string> = {
    admin: t('settings.roleAdmin'),
    manager: t('settings.roleManager'),
    cashier: t('settings.roleCashier'),
  };
  const roleStyle: Record<UserAccount['role'], string> = {
    admin: 'badge badge-emerald',
    manager: 'badge badge-amber',
    cashier: 'badge badge-blue',
  };

  return (
    <div className="surface rounded-2xl overflow-hidden shadow-sm">
      <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users size={18} className="text-emerald-500" />
            {t('settings.staffAccounts')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t('settings.manageStaff')}
          </p>
        </div>
        <button
          id="add-user-btn"
          onClick={onAddUser}
          className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-xl flex items-center gap-2 shadow-sm transition-colors"
        >
          <UserPlus size={16} />
          {t('settings.addUser')}
        </button>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
        {users.map((u) => (
          <div
            key={u.id}
            id={`user-row-${u.id}`}
            className="px-6 py-4 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-100 dark:hover:bg-slate-800/30 transition-colors"
          >
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-600 dark:text-slate-300 font-bold">
                {u.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {u.name}
                  </span>
                  {currentUser?.id === u.id && (
                    <span className="text-[10px] uppercase font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 rounded">
                      {t('settings.youBadge')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={roleStyle[u.role]}>{roleLabel[u.role]}</span>
                  <span
                    className={`text-[10px] font-mono font-bold uppercase ${u.active ? 'text-emerald-500' : 'text-slate-500 dark:text-slate-400'}`}
                  >
                    {u.active ? t('settings.statusActive') : t('settings.statusInactive')}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => onEditUser(u)}
                aria-label={t('settings.editUser')}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-blue-500 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-500/10 rounded-xl transition-colors"
              >
                <Edit2 size={16} />
              </button>
              <button
                id={`del-user-${u.id}`}
                onClick={() => onRemoveUser(u)}
                aria-label={t('settings.deleteUser')}
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
