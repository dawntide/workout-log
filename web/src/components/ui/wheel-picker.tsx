"use client";

import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

// ── Types ──────────────────────────────────────────────────────────────────────

export type WheelPickerProps = {
  /** Array of selectable numeric values */
  values: number[];
  /** Currently selected value */
  value: number;
  /** Called when user selects a new value */
  onChange: (value: number) => void;
  /** Height of each item row in px (default 44) */
  itemHeight?: number;
  /** Number of visible rows (must be odd, default 5) */
  visibleCount?: number;
  /** Format function for display text (default: String) */
  formatValue?: (value: number) => string;
};

export type WheelPickerHandle = {
  scrollToValue: (value: number, animated?: boolean) => void;
};

// ── Constants ──────────────────────────────────────────────────────────────────

const DECELERATION = 0.86;
const MIN_VELOCITY = 2.0;
const SNAP_DURATION_MS = 160;
const MOMENTUM_MULTIPLIER = 0.72;

// ── Component ──────────────────────────────────────────────────────────────────

export const WheelPicker = memo(
  forwardRef<WheelPickerHandle, WheelPickerProps>(function WheelPicker(
    {
      values,
      value,
      onChange,
      itemHeight = 44,
      visibleCount = 5,
      formatValue = String,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const scrollOffsetRef = useRef(0);
    const velocityRef = useRef(0);
    const animFrameRef = useRef<number | null>(null);
    const isDraggingRef = useRef(false);
    const lastTouchYRef = useRef(0);
    const lastTouchTimeRef = useRef(0);
    const trackingPointsRef = useRef<{ y: number; t: number }[]>([]);
    const [, forceRender] = useState(0);

    const selectedIndex = useMemo(() => {
      const idx = values.indexOf(value);
      return idx >= 0 ? idx : 0;
    }, [values, value]);

    const containerHeight = itemHeight * visibleCount;
    const centerOffset = Math.floor(visibleCount / 2) * itemHeight;

    // Compute target offset for a given index
    const offsetForIndex = useCallback(
      (index: number) => -index * itemHeight + centerOffset,
      [itemHeight, centerOffset],
    );

    // Initialize scroll position
    useEffect(() => {
      scrollOffsetRef.current = offsetForIndex(selectedIndex);
      forceRender((n) => n + 1);
    }, [selectedIndex, offsetForIndex]);

    const cancelAnimation = useCallback(() => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    }, []);

    // Find nearest valid index for current offset
    const nearestIndex = useCallback(
      (offset: number) => {
        const raw = -(offset - centerOffset) / itemHeight;
        const clamped = Math.max(0, Math.min(values.length - 1, Math.round(raw)));
        return clamped;
      },
      [centerOffset, itemHeight, values.length],
    );

    // Smooth snap animation to target offset
    const animateSnap = useCallback(
      (targetOffset: number, onDone?: () => void) => {
        cancelAnimation();
        const startOffset = scrollOffsetRef.current;
        const distance = targetOffset - startOffset;
        if (Math.abs(distance) < 0.5) {
          scrollOffsetRef.current = targetOffset;
          forceRender((n) => n + 1);
          onDone?.();
          return;
        }

        const startTime = performance.now();
        const animate = (now: number) => {
          const elapsed = now - startTime;
          const progress = Math.min(1, elapsed / SNAP_DURATION_MS);
          // Ease-out cubic
          const eased = 1 - Math.pow(1 - progress, 3);
          scrollOffsetRef.current = startOffset + distance * eased;
          forceRender((n) => n + 1);

          if (progress < 1) {
            animFrameRef.current = requestAnimationFrame(animate);
          } else {
            scrollOffsetRef.current = targetOffset;
            forceRender((n) => n + 1);
            animFrameRef.current = null;
            onDone?.();
          }
        };
        animFrameRef.current = requestAnimationFrame(animate);
      },
      [cancelAnimation],
    );

    // Momentum + snap animation
    const startMomentum = useCallback(
      (initialVelocity: number) => {
        cancelAnimation();
        let velocity = initialVelocity * MOMENTUM_MULTIPLIER;

        const step = () => {
          if (Math.abs(velocity) < MIN_VELOCITY) {
            // Snap to nearest
            const idx = nearestIndex(scrollOffsetRef.current);
            const target = offsetForIndex(idx);
            animateSnap(target, () => {
              const newVal = values[idx];
              if (newVal !== undefined && newVal !== value) {
                onChange(newVal);
              }
            });
            return;
          }

          scrollOffsetRef.current += velocity;
          velocity *= DECELERATION;

          // Clamp within bounds with rubber band
          const maxOffset = offsetForIndex(0);
          const minOffset = offsetForIndex(values.length - 1);
          if (scrollOffsetRef.current > maxOffset + itemHeight) {
            scrollOffsetRef.current = maxOffset + itemHeight;
            velocity = 0;
          } else if (scrollOffsetRef.current < minOffset - itemHeight) {
            scrollOffsetRef.current = minOffset - itemHeight;
            velocity = 0;
          }

          forceRender((n) => n + 1);
          animFrameRef.current = requestAnimationFrame(step);
        };

        animFrameRef.current = requestAnimationFrame(step);
      },
      [cancelAnimation, nearestIndex, offsetForIndex, animateSnap, values, value, onChange, itemHeight],
    );

    // Snap and commit
    const snapToNearest = useCallback(() => {
      const idx = nearestIndex(scrollOffsetRef.current);
      const target = offsetForIndex(idx);
      animateSnap(target, () => {
        const newVal = values[idx];
        if (newVal !== undefined && newVal !== value) {
          onChange(newVal);
        }
      });
    }, [nearestIndex, offsetForIndex, animateSnap, values, value, onChange]);

    // ── Touch handlers ───────────────────────────────────────────────────

    const handleTouchStart = useCallback(
      (e: React.TouchEvent) => {
        cancelAnimation();
        isDraggingRef.current = true;
        const touch = e.touches[0];
        lastTouchYRef.current = touch.clientY;
        lastTouchTimeRef.current = performance.now();
        trackingPointsRef.current = [{ y: touch.clientY, t: performance.now() }];
        velocityRef.current = 0;
      },
      [cancelAnimation],
    );

    const handleTouchMove = useCallback(
      (e: React.TouchEvent) => {
        if (!isDraggingRef.current) return;
        const touch = e.touches[0];
        const dy = touch.clientY - lastTouchYRef.current;
        scrollOffsetRef.current += dy;
        lastTouchYRef.current = touch.clientY;
        lastTouchTimeRef.current = performance.now();

        // Keep last few points for velocity calculation
        const now = performance.now();
        trackingPointsRef.current.push({ y: touch.clientY, t: now });
        if (trackingPointsRef.current.length > 6) {
          trackingPointsRef.current.shift();
        }

        // Clamp with rubber band effect
        const maxOffset = offsetForIndex(0);
        const minOffset = offsetForIndex(values.length - 1);
        if (scrollOffsetRef.current > maxOffset + itemHeight * 1.5) {
          scrollOffsetRef.current = maxOffset + itemHeight * 1.5;
        } else if (scrollOffsetRef.current < minOffset - itemHeight * 1.5) {
          scrollOffsetRef.current = minOffset - itemHeight * 1.5;
        }

        forceRender((n) => n + 1);
      },
      [offsetForIndex, values.length, itemHeight],
    );

    const handleTouchEnd = useCallback(() => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      const points = trackingPointsRef.current;
      if (points.length >= 2) {
        const last = points[points.length - 1];
        const first = points[0];
        const dt = last.t - first.t;
        if (dt > 0 && dt < 300) {
          const velocity = ((last.y - first.y) / dt) * 16; // px per frame
          if (Math.abs(velocity) > MIN_VELOCITY) {
            startMomentum(velocity);
            return;
          }
        }
      }

      snapToNearest();
    }, [startMomentum, snapToNearest]);

    // ── Mouse handlers (for desktop) ─────────────────────────────────────

    const handleMouseDown = useCallback(
      (e: React.MouseEvent) => {
        cancelAnimation();
        isDraggingRef.current = true;
        lastTouchYRef.current = e.clientY;
        lastTouchTimeRef.current = performance.now();
        trackingPointsRef.current = [{ y: e.clientY, t: performance.now() }];
        velocityRef.current = 0;

        const handleMouseMove = (moveEvent: MouseEvent) => {
          if (!isDraggingRef.current) return;
          moveEvent.preventDefault();
          const dy = moveEvent.clientY - lastTouchYRef.current;
          scrollOffsetRef.current += dy;
          lastTouchYRef.current = moveEvent.clientY;

          const now = performance.now();
          trackingPointsRef.current.push({ y: moveEvent.clientY, t: now });
          if (trackingPointsRef.current.length > 6) {
            trackingPointsRef.current.shift();
          }

          const maxOffset = offsetForIndex(0);
          const minOffset = offsetForIndex(values.length - 1);
          if (scrollOffsetRef.current > maxOffset + itemHeight * 1.5) {
            scrollOffsetRef.current = maxOffset + itemHeight * 1.5;
          } else if (scrollOffsetRef.current < minOffset - itemHeight * 1.5) {
            scrollOffsetRef.current = minOffset - itemHeight * 1.5;
          }

          forceRender((n) => n + 1);
        };

        const handleMouseUp = () => {
          isDraggingRef.current = false;
          window.removeEventListener("mousemove", handleMouseMove);
          window.removeEventListener("mouseup", handleMouseUp);

          const points = trackingPointsRef.current;
          if (points.length >= 2) {
            const last = points[points.length - 1];
            const first = points[0];
            const dt = last.t - first.t;
            if (dt > 0 && dt < 300) {
              const velocity = ((last.y - first.y) / dt) * 16;
              if (Math.abs(velocity) > MIN_VELOCITY) {
                startMomentum(velocity);
                return;
              }
            }
          }

          snapToNearest();
        };

        window.addEventListener("mousemove", handleMouseMove, { passive: false });
        window.addEventListener("mouseup", handleMouseUp);
      },
      [cancelAnimation, offsetForIndex, values.length, itemHeight, startMomentum, snapToNearest],
    );

    // ── Tap to select ────────────────────────────────────────────────────

    const handleItemClick = useCallback(
      (index: number) => {
        if (isDraggingRef.current) return;
        cancelAnimation();
        const target = offsetForIndex(index);
        animateSnap(target, () => {
          const newVal = values[index];
          if (newVal !== undefined) {
            onChange(newVal);
          }
        });
      },
      [cancelAnimation, offsetForIndex, animateSnap, values, onChange],
    );

    // ── Imperative API ───────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      scrollToValue(val: number, animated = true) {
        const idx = values.indexOf(val);
        if (idx < 0) return;
        const target = offsetForIndex(idx);
        if (animated) {
          animateSnap(target);
        } else {
          cancelAnimation();
          scrollOffsetRef.current = target;
          forceRender((n) => n + 1);
        }
      },
    }));

    // ── Cleanup ──────────────────────────────────────────────────────────

    useEffect(() => {
      return () => cancelAnimation();
    }, [cancelAnimation]);

    // ── Render ───────────────────────────────────────────────────────────

    const currentOffset = scrollOffsetRef.current;
    const half = Math.floor(visibleCount / 2);

    // Determine which items to render (visible + buffer)
    const centerIndex = nearestIndex(currentOffset);
    const renderStart = Math.max(0, centerIndex - half - 2);
    const renderEnd = Math.min(values.length - 1, centerIndex + half + 2);

    const items: React.ReactNode[] = [];
    for (let i = renderStart; i <= renderEnd; i++) {
      const y = currentOffset + i * itemHeight;
      const distFromCenter = Math.abs(y - centerOffset);
      const normalizedDist = Math.min(1, distFromCenter / (containerHeight / 2));
      const isSelected = i === selectedIndex && Math.abs(y - centerOffset) < itemHeight * 0.5;
      const opacity = isSelected ? 1 : Math.max(0.14, 1 - normalizedDist * 0.88);
      const scale = isSelected ? 1 : 1 - normalizedDist * 0.1;

      items.push(
        <div
          key={i}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            height: itemHeight,
            top: 0,
            transform: `translate3d(0, ${y}px, 0) scale(${scale})`,
            opacity: Math.max(0, opacity),
            willChange: "transform, opacity",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.5rem",
            fontWeight: isSelected ? 600 : 400,
            color: "var(--v2-ink)",
          }}
          onClick={() => handleItemClick(i)}
        >
          {formatValue(values[i])}
        </div>,
      );
    }

    return (
      <div
        ref={containerRef}
        style={{ height: containerHeight, position: "relative", overflow: "hidden", flex: 1, width: "100%" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
      >
        {/* Highlight band for selected item */}
        <div
          style={{
            position: "absolute",
            left: 8,
            right: 8,
            top: centerOffset,
            height: itemHeight,
            borderRadius: 8,
            background: "var(--v2-paper-2)",
            pointerEvents: "none",
          }}
        />
        {/* Items */}
        {items}
      </div>
    );
  }),
);

WheelPicker.displayName = "WheelPicker";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Generate an array of numbers from min to max with given step */
export function generateNumberRange(min: number, max: number, step: number): number[] {
  const result: number[] = [];
  const precision = Math.max(
    0,
    Math.min(6, (String(step).split(".")[1] ?? "").length),
  );
  for (let v = min; v <= max + step * 0.001; v += step) {
    result.push(Number(v.toFixed(precision)));
  }
  return result;
}
