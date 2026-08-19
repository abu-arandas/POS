## 2024-05-18 - Parallelizing Network Requests
**Learning:** A performance anti-pattern was found where network operations (fetching target store's products/categories and pushing new data) were executed sequentially inside a `for...of` loop over target IDs, causing total execution time to grow linearly O(N).
**Action:** Always leverage `Promise.all` coupled with `.map()` when iterating over arrays if the async operations inside the loop are independent (like querying or pushing data to separate backend endpoints). This parallelization significantly reduces the overall wait time, bringing it closer to O(1) in terms of latency.

## 2024-08-12 - Replacing O(M*N) nested finding with O(N+M) Map lookup
**Learning:** Using `Array.prototype.find()` inside loops that process multiple items (like `tx.items` in kitchen ticket printing) leads to O(M*N) complexity. Although extracting it to a helper function like `catOf = (productId: string) => products.find(...)` hides the loop, it still executes `M` times.
**Action:** When performing lookups inside a loop processing `M` items against a collection of `N` items, pre-compute a `Map` of the `N` items first, making the total complexity O(N + M) which is drastically faster for large `M` and `N`.

## 2026-08-19 - Optimize sorting and array iteration
**Learning:** Instantiating `new Date()` or performing invariant operations (like `.toLowerCase()`) inside array iteration loops (`.filter()`, `.sort()`) causes severe O(N) overhead.
**Action:** Hoist invariants outside the loop, and sort ISO 8601 date strings directly using string comparison (`a < b ? 1 : a > b ? -1 : 0`) instead of parsing them into Date objects.
