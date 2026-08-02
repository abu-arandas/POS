## 2025-01-24 - Pre-compute Hash Maps for O(1) Lookups in Nested Loops
**Learning:** A recurring performance anti-pattern in this codebase is executing synchronous relational lookups (e.g., `Array.prototype.find()`) inside nested render loops, causing O(N*M*P) complexity (e.g. iterating over transactions, then over items, then looking up products).
**Action:** The preferred optimization strategy is pre-computing Hash Maps (`Map`) for O(1) lookups prior to iteration, reducing the complexity to O(P + N*M). Always apply this when looking up relational data in nested loops.
