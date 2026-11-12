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

/**
 * Settings' staff panel: every account with its role, and the controls to
 * add, edit or remove one.
 */
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
    admin:
      'text-[10px] uppercase font-semibold px-2 py-0.5 rounded border bg-foreground/10 text-foreground border-foreground/20',
    manager:
      'text-[10px] uppercase font-semibold px-2 py-0.5 rounded border bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    cashier:
      'text-[10px] uppercase font-semibold px-2 py-0.5 rounded border bg-secondary text-muted-foreground border-border',
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-2xs max-w-3xl mx-auto">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-xs sm:text-sm text-foreground flex items-center gap-2">
            <Users size={16} className="text-muted-foreground" />
            {t('settings.staffAccounts')}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t('settings.manageStaff')}</p>
        </div>
        <button
          id="add-user-btn"
          onClick={onAddUser}
          className="btn-primary h-9 px-3 text-xs font-medium gap-1.5"
        >
          <UserPlus size={14} />
          {t('settings.addUser')}
        </button>
      </div>
      <div className="divide-y divide-border">
        {users.map((u) => (
          <div
            key={u.id}
            id={`user-row-${u.id}`}
            className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-secondary/20 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-9 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0 text-foreground font-mono font-semibold text-xs">
                {u.name.substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-semibold text-foreground truncate">
                    {u.name}
                  </span>
                  {currentUser?.id === u.id && (
                    <span className="text-[10px] uppercase font-semibold text-foreground bg-foreground/10 px-1.5 py-0.2 rounded border border-foreground/20">
                      {t('settings.youBadge')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={roleStyle[u.role]}>{roleLabel[u.role]}</span>
                  <span
                    className={`text-[10px] font-mono uppercase ${u.active ? 'text-emerald-500' : 'text-muted-foreground'}`}
                  >
                    {u.active ? t('settings.statusActive') : t('settings.statusInactive')}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => onEditUser(u)}
                aria-label={t('settings.editUser')}
                className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                <Edit2 size={13} />
              </button>
              <button
                id={`del-user-${u.id}`}
                onClick={() => onRemoveUser(u)}
                aria-label={t('settings.deleteUser')}
                className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
