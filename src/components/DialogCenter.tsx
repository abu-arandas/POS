import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogRequest, useDialogStore } from '../stores/dialogStore';

type ResolveDialog = (value: boolean | string | null) => void;

type VisibleDialog =
  | Pick<Extract<DialogRequest, { kind: 'confirm' }>, 'id' | 'kind' | 'message'>
  | Pick<Extract<DialogRequest, { kind: 'prompt' }>, 'id' | 'kind' | 'message' | 'defaultValue'>;

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
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={
          dialog.kind === 'confirm'
            ? t('common.confirm', 'Confirm')
            : t('common.prompt', 'Input required')
        }
        className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 text-slate-100 shadow-2xl"
      >
        <p className="whitespace-pre-wrap text-sm leading-6">{dialog.message}</p>
        {dialog.kind === 'prompt' && (
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="mt-4 w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500"
            aria-label={t('common.promptValue', 'Value')}
          />
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => resolveCurrent(dialog.kind === 'confirm' ? false : null)}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            type="button"
            onClick={() => resolveCurrent(dialog.kind === 'confirm' ? true : value)}
            className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
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
