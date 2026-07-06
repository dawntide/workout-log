/**
 * A simple debounce utility.
 * Returns a debounced wrapper with a `.cancel()` to clear any pending call.
 */
export function debounce<F extends (...args: never[]) => unknown>(
  func: F,
  delay: number
): ((...args: Parameters<F>) => void) & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const fn = (...args: Parameters<F>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => { func(...args); }, delay);
  };
  fn.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = null;
  };
  return fn;
}
