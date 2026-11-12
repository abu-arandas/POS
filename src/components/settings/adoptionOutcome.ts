import type { AdoptionResult } from '../../lib/cloudAdoption';
import { pullMessages, type PullMessage } from './pullOutcome';

/**
 * What the merge-on-link should tell the operator.
 *
 * Built on `pullMessages` rather than beside it, because the second half of an
 * adoption IS a pull and fails in exactly the same ways: a table that would not
 * load, a cloud that refuses to release staff accounts. Only the headline
 * differs, so only the headline is written here.
 *
 * Says nothing at all for the two outcomes where nothing happened. A terminal
 * that is already linked runs this on every boot, and announcing "nothing to
 * do" every time would train the operator to ignore the one time it matters.
 */
export function adoptionMessages(result: AdoptionResult): PullMessage[] {
  switch (result.outcome) {
    case 'adopted':
    case 'pull-incomplete': {
      const headline: PullMessage = {
        key: result.outcome === 'adopted' ? 'settings.cloudAdopted' : 'settings.cloudAdoptPartial',
      };
      // The per-table detail, minus its own success line: the headline above
      // has already said that, and said it about the merge rather than the
      // pull that happens to have implemented it.
      const detail = (result.pulled ? pullMessages(result.pulled) : []).filter(
        (message) => message.key !== 'settings.pullSuccess',
      );
      return [headline, ...detail];
    }
    case 'push-failed':
      return [{ key: 'settings.cloudAdoptPushFailed' }];
    case 'pull-failed':
      return [{ key: 'settings.cloudAdoptPullFailed' }];
    default:
      return [];
  }
}

/**
 * Whether the merge left something undone, which is what the saved connection
 * status records. A refused staff read is deliberately not counted: the
 * connection is healthy and the database is behaving as configured.
 */
export function adoptionFailed(result: AdoptionResult): boolean {
  return (
    result.outcome === 'push-failed' ||
    result.outcome === 'pull-failed' ||
    result.outcome === 'pull-incomplete'
  );
}
