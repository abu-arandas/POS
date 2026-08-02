## 2026-07-30 - Missing Label Associations
**Learning:** Identified a recurring accessibility issue where `<label>` elements lack the `htmlFor` attribute to explicitly associate them with their respective `<input>` or `<select>` elements. Without this, screen readers fail to read the label when the input is focused.
**Action:** Add `htmlFor` attributes to all independent `<label>` elements and ensure corresponding form controls have matching `id` attributes.
