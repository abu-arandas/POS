import { NotificationTone, useNotificationStore } from '../../stores/notificationStore';
import { useDialogStore } from '../../stores/dialogStore';

/**
 * Raises an app-wide toast from non-React code.
 */
export function notify(message: string, tone: NotificationTone = 'info'): void {
  useNotificationStore.getState().push(message, tone);
}

/**
 * Asks for confirmation through the in-app dialog host.
 */
export function askConfirmation(message: string): Promise<boolean> {
  return useDialogStore.getState().requestConfirm(message);
}

/**
 * Prompts for a line of text through the in-app dialog host, resolving to null
 * when the operator cancels.
 */
export function askText(message: string, defaultValue = ''): Promise<string | null> {
  return useDialogStore.getState().requestPrompt(message, defaultValue);
}
