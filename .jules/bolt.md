## 2024-05-18 - Avoiding nested `.find()` in render loops by mapping over objects directly
**Learning:** In React components like `ProductGrid.tsx`, a common anti-pattern is mapping over extracted IDs and then using `.find()` inside the render loop to retrieve the original object. This causes O(N^2) complexity on every render.
**Action:** Instead of mapping an array of IDs and looking up their objects, either construct an array of the needed objects beforehand or map over the object array directly to achieve O(N) rendering.

## 2024-05-24 - Parallelizing Loop Asynchronous Work
**Learning:** Calling sequential `await` on cryptographic/hashing tasks within an array iteration drastically slows down execution proportional to the array size. For instance, hashing passwords/PINs sequentially block processing.
**Action:** Always pre-compute map arrays of asynchronous operations using `Promise.all` before executing synchronous validation/business-logic loops on elements that require parallelizable lookups.
