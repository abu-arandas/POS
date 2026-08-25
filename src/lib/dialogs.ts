import { useDialogStore } from '../stores/dialogStore';

export function askConfirmation(message: string): Promise<boolean> {
  return useDialogStore.getState().requestConfirm(message);
}

export function askText(message: string, defaultValue = ''): Promise<string | null> {
  return useDialogStore.getState().requestPrompt(message, defaultValue);
}
