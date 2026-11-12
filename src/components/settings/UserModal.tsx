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

/**
 * Dialog for creating or editing a staff account: name, role, PIN and
 * whether the account is active. On an existing account a blank PIN field
 * leaves the current PIN alone.
 */
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
      className="w-full max-w-sm bg-card border border-border rounded-xl shadow-xl overflow-hidden"
      compactAnimation
    >
      <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-secondary/20">
        <h3
          id="user-modal-title"
          className="font-semibold text-xs sm:text-sm text-foreground flex items-center gap-2"
        >
          <UserPlus size={16} className="text-muted-foreground" />
          {editingUser ? t('settings.editUser') : t('settings.newUser')}
        </h3>
        <button
          onClick={() => onClose()}
          aria-label={t('settings.cancel')}
          className="size-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <X size={15} />
        </button>
      </div>
      <form onSubmit={onSubmit} className="p-5 space-y-3.5">
        <div>
          <label
            htmlFor="user-name-input"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            {t('settings.userName')}
          </label>
          <input
            id="user-name-input"
            type="text"
            required
            value={userName}
            onChange={(e) => onUserNameChange(e.target.value)}
            className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
          />
        </div>
        <div>
          <label
            htmlFor="user-role-select"
            className="block text-xs font-medium text-muted-foreground mb-1"
          >
            {t('settings.userRole')}
          </label>
          <select
            id="user-role-select"
            value={userRole}
            onChange={(e) => onUserRoleChange(e.target.value as UserAccount['role'])}
            className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 text-xs sm:text-sm text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
          >
            <option value="admin">{t('settings.roleAdmin')}</option>
            <option value="manager">{t('settings.roleManager')}</option>
            <option value="cashier">{t('settings.roleCashier')}</option>
          </select>
        </div>
        <div>
          <label
            htmlFor="user-pin-input"
            className="block text-xs font-medium text-muted-foreground mb-1"
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
            className="w-full bg-secondary/40 border border-border rounded-lg px-3 py-2 font-mono tracking-[0.5em] text-base text-center text-foreground focus:outline-none focus:border-foreground/50 transition-colors"
          />
        </div>
        <label className="flex items-center gap-3 p-3 bg-secondary/20 border border-border rounded-lg cursor-pointer hover:bg-secondary/30 transition-colors">
          <input
            id="user-active-checkbox"
            type="checkbox"
            checked={userActive}
            onChange={(e) => onUserActiveChange(e.target.checked)}
            className="size-4 rounded border-border text-foreground focus:ring-foreground accent-foreground"
          />
          <span className="text-xs font-medium text-foreground">{t('settings.statusActive')}</span>
        </label>
        <div className="flex justify-end gap-2 pt-3 border-t border-border">
          <button
            type="button"
            onClick={() => onClose()}
            className="btn-secondary h-8 px-3 text-xs"
          >
            {t('settings.cancel')}
          </button>
          <button
            id="user-save-btn"
            type="submit"
            className="btn-primary h-8 px-3 text-xs font-medium gap-1.5"
          >
            <Check size={14} />
            {t('settings.saveUser')}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
