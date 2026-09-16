import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogRequest, useDialogStore } from '../stores/dialogStore';

type ResolveDialog = (value: boolean | string | null) => void;

type VisibleDialog =
  | Pick<Extract<DialogRequest, { kind: 'confirm' }>, 'id' | 'kind' | 'message'>
  | Pick<Extract<DialogRequest, { kind: 'prompt' }>, 'id' | 'kind' | 'message' | 'defaultValue'>;

/**
 * One queued dialog rendered as a confirm or a prompt, resolving the promise
 * the caller is waiting on. Split from the queue itself so each dialog gets a
 * fresh input value and focus target rather than inheriting the last one's.
 */
function DialogContent({
  dialog,
  resolveCurrent,
}: {
  dialog: VisibleDialog;
  resolveCurrent: ResolveDialog;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(dialog.kind === 'prompt' ? dialog.defaultValue : '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') resolveCurrent(dialog.kind === 'confirm' ? false : null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog.kind, resolveCurrent]);

  useEffect(() => {
    if (dialog.kind === 'prompt') inputRef.current?.focus();
  }, [dialog.kind]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center modal-backdrop p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          dialog.kind === 'confirm'
            ? t('common.confirm', 'Confirm')
            : t('common.prompt', 'Input required')
        }
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5 text-foreground shadow-xl"
      >
        <p className="whitespace-pre-wrap text-xs sm:text-sm text-foreground leading-relaxed">{dialog.message}</p>
        {dialog.kind === 'prompt' && (
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-3.5 w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs sm:text-sm text-foreground outline-none focus:border-foreground/50 transition-colors"
            aria-label={t('common.promptValue', 'Value')}
          />
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => resolveCurrent(dialog.kind === 'confirm' ? false : null)}
            className="btn-secondary h-8 px-3 text-xs"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => resolveCurrent(dialog.kind === 'confirm' ? true : value)}
            className="btn-primary h-8 px-3 text-xs font-medium"
          >
            {t('common.confirm', 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the head of the dialog queue and resolves its promise with the
 * operator's answer. Mounted once at the app root.
 */
export default function DialogCenter() {
  const dialog = useDialogStore((state) => state.queue[0]);
  const resolveCurrent = useDialogStore((state) => state.resolveCurrent);

  if (!dialog) return null;
  return <DialogContent key={dialog.id} dialog={dialog} resolveCurrent={resolveCurrent} />;
}
