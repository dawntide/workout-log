"use client";

import { useCallback, useEffect, useRef } from "react";

/** Only the fields the history sync needs — works for any store list item. */
type DetailHistoryItem = { template: { id: string; slug: string } };

const DETAIL_PARAM = "detail";

function locationWithDetail(slug: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(DETAIL_PARAM, slug);
  return `${url.pathname}${url.search}${url.hash}`;
}

function locationWithoutDetail() {
  const url = new URL(window.location.href);
  url.searchParams.delete(DETAIL_PARAM);
  return `${url.pathname}${url.search}${url.hash}`;
}

function readDetailSlug() {
  return new URLSearchParams(window.location.search).get(DETAIL_PARAM);
}

/**
 * Makes the program detail sheet behave like a page: opening it pushes a
 * `?detail=<slug>` history entry so the back gesture closes the sheet instead of
 * leaving the store, and the URL stays shareable (the bootstrap controller
 * already resolves `?detail=` on load).
 *
 * The pushed entry is tracked with a ref rather than history state so Next's own
 * router state on that entry is left untouched.
 */
export function useProgramStoreDetailHistory({
  listItems,
  setDetailTargetId,
}: {
  listItems: DetailHistoryItem[];
  setDetailTargetId: (id: string | null) => void;
}) {
  const pushedRef = useRef(false);
  // The popstate listener must read the current list without being re-bound on
  // every store refresh, otherwise a refresh mid-sheet could drop the listener.
  const listItemsRef = useRef(listItems);
  useEffect(() => {
    listItemsRef.current = listItems;
  }, [listItems]);

  useEffect(() => {
    const syncFromLocation = () => {
      pushedRef.current = false;
      const slug = readDetailSlug();
      if (!slug) {
        setDetailTargetId(null);
        return;
      }
      const item = listItemsRef.current.find((entry) => entry.template.slug === slug);
      setDetailTargetId(item ? item.template.id : null);
    };
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, [setDetailTargetId]);

  const openDetail = useCallback(
    (item: DetailHistoryItem) => {
      setDetailTargetId(item.template.id);
      window.history.pushState(null, "", locationWithDetail(item.template.slug));
      pushedRef.current = true;
    },
    [setDetailTargetId],
  );

  /** Variant switches stay on the same history entry — back still closes once. */
  const replaceDetail = useCallback(
    (item: DetailHistoryItem) => {
      setDetailTargetId(item.template.id);
      window.history.replaceState(null, "", locationWithDetail(item.template.slug));
    },
    [setDetailTargetId],
  );

  const closeDetail = useCallback(() => {
    if (pushedRef.current) {
      // Let the pop drive the state change so a user-pressed back and an
      // in-sheet close land on exactly the same history position.
      pushedRef.current = false;
      window.history.back();
      return;
    }
    // Deeplinked (or post-mutation) close: no entry of ours to pop, so just drop
    // the param in place.
    setDetailTargetId(null);
    if (readDetailSlug()) {
      window.history.replaceState(null, "", locationWithoutDetail());
    }
  }, [setDetailTargetId]);

  return { openDetail, replaceDetail, closeDetail };
}
