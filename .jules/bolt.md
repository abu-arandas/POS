## 2024-05-18 - Avoiding nested `.find()` in render loops by mapping over objects directly
**Learning:** In React components like `ProductGrid.tsx`, a common anti-pattern is mapping over extracted IDs and then using `.find()` inside the render loop to retrieve the original object. This causes O(N^2) complexity on every render.
**Action:** Instead of mapping an array of IDs and looking up their objects, either construct an array of the needed objects beforehand or map over the object array directly to achieve O(N) rendering.
