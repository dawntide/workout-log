// Re-export of the Drizzle query operators bound to THIS package's single
// drizzle-orm instance. Out-of-package consumers (apps/api) import operators
// from here instead of "drizzle-orm" directly, so schema columns and operators
// share one drizzle type instance (avoids duplicate-copy branded-type clashes).
// No runtime behavior — a pure pass-through.
export {
  eq,
  ne,
  and,
  or,
  not,
  gt,
  gte,
  lt,
  lte,
  inArray,
  notInArray,
  isNull,
  isNotNull,
  asc,
  desc,
  sql,
  count,
  max,
  min,
  sum,
  avg,
} from "drizzle-orm";

// 조건식 배열(`SQL[]`)을 조립하는 소비처가 있어 타입도 같은 인스턴스에서 내보낸다.
export type { SQL } from "drizzle-orm";
