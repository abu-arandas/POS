## 2024-11-20 - Sequential network requests in CatalogPush loops
**Learning:** Sequential await loops for network operations (like pushing catalogs to multiple targets) are a performance bottleneck, taking O(N) time instead of O(1) where N is the number of target stores.
**Action:** Always verify if `for...of` loops performing asynchronous actions like I/O and network requests can be safely parallelized using `Promise.all` with a `.map()` to reduce the total execution time, especially when targeting multiple nodes or stores.
