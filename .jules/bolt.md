## 2024-05-18 - Avoiding nested `.find()` in render loops by mapping over objects directly
**Learning:** In React components like `ProductGrid.tsx`, a common anti-pattern is mapping over extracted IDs and then using `.find()` inside the render loop to retrieve the original object. This causes O(N^2) complexity on every render.
**Action:** Instead of mapping an array of IDs and looking up their objects, either construct an array of the needed objects beforehand or map over the object array directly to achieve O(N) rendering.

## 2026-08-05 - Pre-computing Maps to avoid O(N*M) lookups in render loops
**Learning:** In components rendering lists (like `Inventory.tsx`), extracting related data (e.g. Categories) via `.find()` within helper functions called inside the `.map()` loop leads to an O(N * M) performance bottleneck (N items, M categories).
**Action:** Use a `useMemo` hook to pre-compute a `Map` of related objects indexed by their IDs prior to the render loop. Lookups inside the iteration become O(1), improving overall complexity to O(N + M).
