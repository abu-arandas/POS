## 2023-10-27 - Widespread Missing Form Linkages
**Learning:** Across the EA POS app, `<label>` elements frequently lack the `htmlFor` attribute. This is a recurring accessibility issue that reduces the clickable target area and fails to associate fields for screen readers.
**Action:** Always check for `htmlFor` and matching `id`s when modifying or interacting with forms, and make sure to explicitly create these linkages as micro-UX improvements.
