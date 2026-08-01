## 2026-08-01 - Relational lookups inside nested loops
**Learning:** A recurring performance anti-pattern in this codebase is executing synchronous relational lookups (e.g., Array.prototype.find()) inside nested render loops, causing O(N*M*P) complexity during large array operations.
**Action:** The preferred optimization strategy is pre-computing Hash Maps (Map) for O(1) lookups prior to iteration, reducing time complexity to O(N+M+P).
