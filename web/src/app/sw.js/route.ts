import { NextResponse } from 'next/server';

export function GET() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || Date.now().toString();

  const swCode = `'use strict';

// ---------------------------------------------------------------------------
// Cache names — bump CACHE_VERSION when deploying breaking asset changes.
// Old caches are auto-deleted in the activate handler.
// ---------------------------------------------------------------------------
const CACHE_VERSION = 'v1-' + '${version}';
const STATIC_CACHE = 'wl-static-' + CACHE_VERSION;   // /_next/static/** (immutable)
const ASSETS_CACHE = 'wl-assets-' + CACHE_VERSION;   // icons, fonts, offline page
const ALL_CACHES = [STATIC_CACHE, ASSETS_CACHE];

// Precache these on install so the offline fallback is always available.
const PRECACHE_URLS = [
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ---------------------------------------------------------------------------
// Install — precache essentials, activate immediately.
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(ASSETS_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ---------------------------------------------------------------------------
// Activate — delete stale caches, claim all clients right away.
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !ALL_CACHES.includes(k)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ---------------------------------------------------------------------------
// Fetch routing
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin GET requests.
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  // API routes — network-only. Never cache authenticated data.
  if (url.pathname.startsWith('/api/')) return;

  // Next.js immutable static assets (content-hashed filenames) — cache-first.
  // 개발 환경(localhost)에서는 파일명에 해시가 없어 재컴파일 시 갱신이 안 되므로 캐시하지 않음.
  if (url.pathname.startsWith('/_next/static/')) {
    const isDev = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';
    if (!isDev) event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Public icons / images / fonts — stale-while-revalidate.
  if (
    url.pathname.startsWith('/icons/') ||
    /\\.(png|jpg|jpeg|svg|ico|webp|woff2?|ttf|otf)$/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request, ASSETS_CACHE));
    return;
  }

  // HTML navigation — network-first, serve cached page or offline.html on failure.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithOfflineFallback(request));
    return;
  }

  // Everything else — network-first, silent cache fallback.
  event.respondWith(networkFirst(request));
});

// ---------------------------------------------------------------------------
// Push — 휴식 종료 알림(apps/api dispatchDueRestPushes가 보낸다).
// iOS는 userVisibleOnly 구독이라 푸시마다 반드시 알림을 띄워야 한다 — 페이로드가
// 깨져도 기본 문구로 띄운다. 이동 경로는 화이트리스트만 허용한다.
// ---------------------------------------------------------------------------
const PUSH_PATHS = ['/workout/log'];

self.addEventListener('push', (event) => {
  let data = {};
  try { data = (event.data && event.data.json()) || {}; } catch { /* 기본 문구로 표시 */ }
  if (!data || typeof data !== 'object') data = {};
  const title = typeof data.title === 'string' && data.title ? data.title.slice(0, 80) : 'Workout Log';
  const body = typeof data.body === 'string' ? data.body.slice(0, 180) : '';
  const url = PUSH_PATHS.includes(data.url) ? data.url : '/';
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: typeof data.tag === 'string' ? data.tag.slice(0, 40) : 'workout-log',
      data: { url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification.data && event.notification.data.url;
  const target = new URL(PUSH_PATHS.includes(path) ? path : '/', self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // 이미 열린 앱 창이 있으면 새로 열지 않고 그 창을 앞으로 가져온다 — 기록 중인
      // 드래프트를 새 창이 덮지 않게.
      const existing =
        windows.find((client) => new URL(client.url).pathname === target.pathname) || windows[0];
      if (existing) return existing.focus();
      return self.clients.openWindow(target.href);
    })()
  );
});

// ---------------------------------------------------------------------------
// Strategy helpers
// ---------------------------------------------------------------------------

/** Cache-first: serve from cache; populate cache on network miss. */
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

/** Stale-while-revalidate: return cached immediately; update cache in background. */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() =>
      // cached 가 undefined(캐시 미스)인 경우에도 반드시 Response를 반환해야 함.
      // undefined를 respondWith에 넘기면 SW가 오류를 발생시킴.
      cached ?? new Response('Network error', { status: 503 })
    );

  return cached ?? networkFetch;
}

/** Network-first for HTML: try network; fall back to cached page then offline.html. */
async function networkFirstWithOfflineFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    const offline = await caches.match('/offline.html');
    return (
      offline ??
      new Response('오프라인 상태입니다', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    );
  }
}

/** Network-first for other requests: try network; fall back to cache silently. */
async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await caches.match(request);
    return cached ?? new Response('Network error', { status: 503 });
  }
}
`;

  return new NextResponse(swCode, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}
