import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { useNotificationStore } from '../../src/stores/notificationStore';

// Every refusal in the app reaches the operator through this queue — an
// insufficient tender, a stock shortfall, a cloud delete the server rejected.
// A toast that never auto-dismisses, or a burst that pushes the newest one off
// the end, is a message the operator never reads.

describe('the toast queue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotificationStore.setState({ notifications: [] });
  });

  afterEach(() => vi.useRealTimers());

  it('queues a message with its tone and returns its id', () => {
    const id = useNotificationStore.getState().push('Not enough stock', 'error');

    const [notice] = useNotificationStore.getState().notifications;
    expect(notice).toEqual({ id, message: 'Not enough stock', tone: 'error' });
  });

  it('defaults to the informational tone', () => {
    useNotificationStore.getState().push('Saved');
    expect(useNotificationStore.getState().notifications[0].tone).toBe('info');
  });

  it('auto-dismisses after the given duration', () => {
    useNotificationStore.getState().push('Saved', 'success', 1_000);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    vi.advanceTimersByTime(1_000);

    expect(useNotificationStore.getState().notifications).toEqual([]);
  });

  it('keeps a toast up for its full duration and no longer', () => {
    useNotificationStore.getState().push('Saved', 'info', 4_000);

    vi.advanceTimersByTime(3_999);
    expect(useNotificationStore.getState().notifications).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(useNotificationStore.getState().notifications).toHaveLength(0);
  });

  it('keeps the five most recent when messages pile up', () => {
    for (let i = 1; i <= 7; i += 1) useNotificationStore.getState().push(`notice ${i}`);

    const messages = useNotificationStore.getState().notifications.map((n) => n.message);
    expect(messages).toEqual(['notice 3', 'notice 4', 'notice 5', 'notice 6', 'notice 7']);
  });

  it('dismisses the toast named and leaves the rest', () => {
    const first = useNotificationStore.getState().push('first');
    useNotificationStore.getState().push('second');

    useNotificationStore.getState().remove(first);

    expect(useNotificationStore.getState().notifications.map((n) => n.message)).toEqual(['second']);
  });

  it('ignores a dismissal for a toast that is already gone', () => {
    useNotificationStore.getState().push('still here');
    useNotificationStore.getState().remove('notice-nonexistent');

    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it('does not resurrect a toast when its timer fires after a manual dismissal', () => {
    const id = useNotificationStore.getState().push('dismissed early', 'info', 4_000);
    useNotificationStore.getState().remove(id);
    useNotificationStore.getState().push('the one still showing');

    vi.advanceTimersByTime(4_000);

    // The first toast's timer fires against an id that is no longer queued; the
    // second is dismissed by its own timer a moment later.
    expect(useNotificationStore.getState().notifications).toEqual([]);
  });
});
