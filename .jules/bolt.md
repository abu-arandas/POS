## 2024-05-18 - Avoiding nested `.find()` in render loops by mapping over objects directly
**Learning:** In React components like `ProductGrid.tsx`, a common anti-pattern is mapping over extracted IDs and then using `.find()` inside the render loop to retrieve the original object. This causes O(N^2) complexity on every render.
**Action:** Instead of mapping an array of IDs and looking up their objects, either construct an array of the needed objects beforehand or map over the object array directly to achieve O(N) rendering.

## 2025-02-12 - Nested Lookups Anti-pattern Addressed
**Learning:** In React components like `Inventory.tsx`, using `.find()` inside a map loop directly bound to the UI render tree incurs O(N*M) complexity which scales poorly when handling large datasets. This pattern occurs in a few places and causes noticeable lag in product lists and other tables.
**Action:** When working on lists that require relational lookups by ID, always pre-compute a Hash Map (O(1) lookups) via `useMemo` before mapping the main array to reduce the complexity to O(N+M).
