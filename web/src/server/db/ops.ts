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
} from "drizzle-orm";
