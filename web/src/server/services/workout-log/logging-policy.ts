export function shouldBlockAutoProgressionNewLog(input: {
  planAutoProgression?: boolean;
  hasExistingLogForDate: boolean;
  hasLaterLogs: boolean;
}) {
  return input.planAutoProgression === true && !input.hasExistingLogForDate && input.hasLaterLogs;
}
