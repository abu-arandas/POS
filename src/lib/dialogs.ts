import { useDialogStore } from '../stores/dialogStore';

/**
 * Asks for confirmation through the in-app dialog host. The promise resolves
 * when the operator answers — the app-wide replacement for window.confirm.
 */
export function askConfirmation(message: string): Promise<boolean> {
  return useDialogStore.getState().requestConfirm(message);
}

/**
 * Prompts for a line of text through the in-app dialog host, resolving to null
 * if the operator cancels. The app-wide replacement for window.prompt.
 */
export function askText(message: string, defaultValue = ''): Promise<string | null> {
  return useDialogStore.getState().requestPrompt(message, defaultValue);
}
