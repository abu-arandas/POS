## 2024-05-24 - Initial Entry

## 2024-06-25 - Missing htmlFor attributes on `<label>` elements
**Learning:** A recurring pattern in the EA POS application involves missing `htmlFor` attributes on form `<label>` tags. Screen readers depend on explicit pairing to understand context, especially when input states change.
**Action:** Always verify proper `<label>` to `<input>` pairings using `htmlFor` and `id` across forms, particularly when modifying form structures or reviewing PRs.
