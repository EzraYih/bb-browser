### Task 1: 创建 `log.ts` 工具函数

**Files:**
- Create: `packages/daemon/src/log.ts`
- Test: `packages/daemon/src/__tests__/log.test.ts`

**Interfaces:**
- Produces: `ts(): string` — 返回 ISO 8601 时间戳字符串

- [ ] **Step 1: Write the failing test**

Create `packages/daemon/src/__tests__/log.test.ts`:

```typescript
/**
 * log.ts tests — verify ts() returns ISO 8601 timestamp.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ts } from "../log.js";

describe("log.ts", () => {
  it("ts() returns a string matching ISO 8601 format", () => {
    const result = ts();
    assert.equal(typeof result, "string");
    // ISO 8601: YYYY-MM-DDTHH:mm:ss.sssZ
    assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  it("ts() returns a value close to Date.now()", () => {
    const before = Date.now();
    const result = ts();
    const after = Date.now();
    const parsed = new Date(result).getTime();
    assert.ok(parsed >= before && parsed <= after,
      `ts() timestamp ${result} should be between ${before} and ${after}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd D:\2026\InnoSphere\02-Labs\bb-browser && npx tsx --test packages/daemon/src/__tests__/log.test.ts`
Expected: FAIL with "Cannot find module '../log.js'" or similar import error

- [ ] **Step 3: Write minimal implementation**

Create `packages/daemon/src/log.ts`:

```typescript
/**
 * Logging utilities for the daemon.
 *
 * Provides timestamp formatting for consistent log output.
 * All daemon log lines use the format: [${ts()}] [Component] message
 */

/**
 * Returns the current time as an ISO 8601 string.
 * Used as a prefix for all daemon log output.
 */
export function ts(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd D:\2026\InnoSphere\02-Labs\bb-browser && npx tsx --test packages/daemon/src/__tests__/log.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd D:\2026\InnoSphere\02-Labs\bb-browser
git add packages/daemon/src/log.ts packages/daemon/src/__tests__/log.test.ts
git commit -m "feat(daemon): add log.ts with ts() timestamp utility"
```
