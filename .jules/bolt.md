## 2024-11-20 - Parallelize async loops for network calls
**Learning:** Executing async operations sequentially inside a loop (e.g., fetching or pushing data to multiple stores one by one) is a performance anti-pattern that drastically increases total wait time when dealing with multiple items.
**Action:** Always check if loops containing `await` can be refactored using `Promise.all(array.map(async item => ...))` to parallelize the requests, provided there are no side effects or strictly required sequence dependencies.
