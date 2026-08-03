## 2024-05-15 - Array.prototype.find in loops
**Learning:** A recurring performance anti-pattern in this codebase is executing synchronous relational lookups (e.g., `Array.prototype.find()`) inside nested render loops. The preferred optimization strategy is pre-computing Hash Maps (`Map`) for O(1) lookups prior to iteration.
**Action:** Replace `find` in `.map` or inside render loops with O(1) Map lookups for better performance.
