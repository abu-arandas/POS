import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { AttemptState, recordFailure, clearFailures } from '../lib/pinThrottle';
import { idbStorage } from '../lib/idbStorage';

interface PinAttemptState {
  attempts: AttemptState;
  registerFailure: (key: string) => void;
  registerSuccess: (key: string) => void;
}

// Failed-PIN counters, persisted so a lockout survives a reload — otherwise
// refreshing the page (or restarting the app) resets the throttle and the
// brute-force protection is decorative. Terminal-local: this is about one
// physical device, so it is deliberately not cloud-synced.
export const usePinAttemptStore = create<PinAttemptState>()(
  persist(
    (set, get) => ({
      attempts: {},
      registerFailure: (key) =>
        set({ attempts: recordFailure(get().attempts, key, Date.now()) }),
      registerSuccess: (key) => set({ attempts: clearFailures(get().attempts, key) }),
    }),
    {
      name: 'pos-pin-attempt-storage',
      storage: createJSONStorage(() => idbStorage),
    },
  ),
);
