import { beforeEach, describe, expect, it } from 'vitest';
import { useDialogStore } from '../../src/stores/dialogStore';

describe('useDialogStore', () => {
  beforeEach(() => {
    useDialogStore.setState({ queue: [] });
  });

  it('resolves queued confirmations and removes the current request', async () => {
    const result = useDialogStore.getState().requestConfirm('Delete?');
    expect(useDialogStore.getState().queue).toHaveLength(1);

    useDialogStore.getState().resolveCurrent(true);

    await expect(result).resolves.toBe(true);
    expect(useDialogStore.getState().queue).toHaveLength(0);
  });

  it('returns null when a prompt is cancelled', async () => {
    const result = useDialogStore.getState().requestPrompt('Label?', 'Default');
    useDialogStore.getState().resolveCurrent(null);

    await expect(result).resolves.toBeNull();
  });
});
