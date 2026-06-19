// ironlog terminal 프리미티브 배럴 (R1 예외 구역: Unicode/Nerd 글리프 허용).
// 향후 TermSparkline·TermBadge·TermLog 등 추가.
export { TermShell } from "./term-shell";
export type { TermTab } from "./term-shell";
export { TermProgress } from "./term-progress";
export type { TermProgressTone } from "./term-progress";
export { TermBadge } from "./term-badge";
export type { TermBadgeTone } from "./term-badge";
export { TermLog } from "./term-log";
export type { TermLogTone, TermLogSegment, TermLogEntry } from "./term-log";
export {
  TermKeyHintProvider,
  useTermFooterRegistration,
  useRegisterTermFooter,
} from "./term-keyhint-context";
export type {
  TermModeTone,
  TermKeyHintItem,
  TermFooterRegistration,
} from "./term-keyhint-context";
