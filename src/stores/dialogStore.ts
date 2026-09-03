import { create } from 'zustand';
import { shortId } from '../lib/utils/ids';

/**
 * One queued dialog and the promise resolver waiting on the operator's answer.
 * The resolver is what lets askConfirmation/askText read as ordinary awaits.
 */
export type DialogRequest =
  | {
      id: string;
      kind: 'confirm';
      message: string;
      resolve: (value: boolean) => void;
    }
  | {
      id: string;
      kind: 'prompt';
      message: string;
      defaultValue: string;
      resolve: (value: string | null) => void;
    };

interface DialogState {
  queue: DialogRequest[];
  requestConfirm: (message: string) => Promise<boolean>;
  requestPrompt: (message: string, defaultValue?: string) => Promise<string | null>;
  resolveCurrent: (value: boolean | string | null) => void;
}

/**
 * Queue behind the app's confirm and prompt dialogs. Requests are served one at
 * a time by DialogCenter, which renders them as in-app, translated, focus-
 * managed dialogs in place of the browser's native confirm/prompt.
 */
export const useDialogStore = create<DialogState>((set, get) => ({
  queue: [],
  requestConfirm: (message) =>
    new Promise<boolean>((resolve) =>
      set((state) => ({
        queue: [...state.queue, { id: `dialog-${shortId()}`, kind: 'confirm', message, resolve }],
      })),
    ),
  requestPrompt: (message, defaultValue = '') =>
    new Promise<string | null>((resolve) =>
      set((state) => ({
        queue: [
          ...state.queue,
          { id: `dialog-${shortId()}`, kind: 'prompt', message, defaultValue, resolve },
        ],
      })),
    ),
  resolveCurrent: (value) => {
    const current = get().queue[0];
    if (!current) return;
    set((state) => ({ queue: state.queue.slice(1) }));
    if (current.kind === 'confirm' && typeof value === 'boolean') current.resolve(value);
    if (current.kind === 'prompt' && (typeof value === 'string' || value === null))
      current.resolve(value);
  },
}));
