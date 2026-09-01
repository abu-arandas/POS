import type { TFunction } from 'i18next';
import { Check, UserPlus, X } from 'lucide-react';
import { ModalShell } from '../shared/ModalShell';
import type { FormEvent, RefObject } from 'react';
import type { UserAccount } from '../../types';

export interface UserModalProps {
  t: TFunction;
  modalRef: RefObject<HTMLDivElement | null>;
  editingUser: UserAccount | null;
  userName: string;
  userRole: UserAccount['role'];
  userPin: string;
  userActive: boolean;
  onUserNameChange(value: string): void;
  onUserRoleChange(value: UserAccount['role']): void;
  onUserPinChange(value: string): void;
  onUserActiveChange(value: boolean): void;
  onClose(): void;
  onSubmit(event: FormEvent): void | Promise<void>;
}

export function UserModal({
  t,
  modalRef,
  editingUser,
  userName,
  userRole,
  userPin,
  userActive,
  onUserNameChange,
  onUserRoleChange,
  onUserPinChange,
  onUserActiveChange,
  onClose,
  onSubmit,
}: UserModalProps) {
  return (
    <ModalShell
      id="user-modal"
      modalRef={modalRef}
      titleId="user-modal-title"
      className="w-full max-w-sm"
      compactAnimation
    >
      <div className="px-6 py-4 border-b border-slate-200/10 flex items-center justify-between">
        <h3
          id="user-modal-title"
          className="font-bold text-slate-800 dark:text-white flex items-center gap-2"
        >
          <UserPlus size={18} className="text-emerald-500" />
          {editingUser ? t('settings.editUser') : t('settings.newUser')}
        </h3>
        <button
          onClick={() => onClose()}
          aria-label={t('settings.cancel')}
          className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <X size={16} />
        </button>
      </div>
      <form onSubmit={onSubmit} className="p-6 space-y-4">
        <div>
          <label
            htmlFor="user-name-input"
            className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2"
          >
            {t('settings.userName')}
          </label>
          <input
            id="user-name-input"
            type="text"
            required
            value={userName}
            onChange={(e) => onUserNameChange(e.target.value)}
            className="glass-input w-full px-4 py-2.5 rounded-xl"
          />
        </div>
        <div>
          <label
            htmlFor="user-role-select"
            className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2"
          >
            {t('settings.userRole')}
          </label>
          <select
            id="user-role-select"
            value={userRole}
            onChange={(e) => onUserRoleChange(e.target.value as UserAccount['role'])}
            className="glass-input w-full px-4 py-2.5 rounded-xl appearance-none"
          >
            <option value="admin">{t('settings.roleAdmin')}</option>
            <option value="manager">{t('settings.roleManager')}</option>
            <option value="cashier">{t('settings.roleCashier')}</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="user-pin-input"
            className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2"
          >
            {editingUser ? t('settings.userPinKeep') : t('settings.userPin')}
          </label>
          <input
            id="user-pin-input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            value={userPin}
            onChange={(e) => onUserPinChange(e.target.value.replace(/\D/g, ''))}
            className="glass-input w-full px-4 py-2.5 rounded-xl font-mono tracking-[0.5em] text-lg text-center"
          />
        </div>
        <label className="flex items-center gap-3 p-4 bg-slate-100 dark:bg-slate-800/30 rounded-xl cursor-pointer">
          <input
            id="user-active-checkbox"
            type="checkbox"
            checked={userActive}
            onChange={(e) => onUserActiveChange(e.target.checked)}
            className="w-5 h-5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 bg-white dark:bg-slate-900"
          />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {t('settings.statusActive')}
          </span>
        </label>
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-200/10">
          <button
            type="button"
            onClick={() => onClose()}
            className="px-5 py-2.5 text-sm font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            {t('settings.cancel')}
          </button>
          <button
            id="user-save-btn"
            type="submit"
            className="px-5 py-2.5 text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl flex items-center gap-2 shadow-sm transition-colors"
          >
            <Check size={16} />
            {t('settings.saveUser')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
