# Workout Log Web

추가 문서:
- `git clone` 직후 온보딩: [`docs/local-dev-after-clone-guide.md`](./docs/local-dev-after-clone-guide.md)
- 언어 설정 / i18n 운영 가이드: [`docs/language-settings-guide.md`](./docs/language-settings-guide.md)
- iOS Safari 상태바 / safe-area 메모: [`docs/safari-status-bar-guide.md`](./docs/safari-status-bar-guide.md)
- 기여/형상관리 규칙: [`../CONTRIBUTING.md`](../CONTRIBUTING.md)

## Local Dev

```bash
pnpm run dev:check
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

`pnpm db:seed` seeds shared catalog data only. If you intentionally need sample plans for local verification, run `pnpm db:seed:demo-plans`.

Required local env (`.env.local`):

```bash
DATABASE_URL=postgres://app:app@127.0.0.1:5432/workoutlog
NEXT_PUBLIC_APP_URL=http://localhost:3000
WORKOUT_AUTH_USER_ID=local-user
WORKOUT_API_ALLOW_ENV_AUTH=1
NEXT_PUBLIC_DISABLE_SW=1
APPS_API_BASE=http://127.0.0.1:8787
APPS_API_HOST=127.0.0.1
```

The web app proxies data APIs to `apps/api`. Run both development servers:

```bash
pnpm --dir apps/api dev:web
pnpm --dir web dev
```

`WORKOUT_API_ALLOW_ENV_AUTH=1` enables the `WORKOUT_AUTH_USER_ID` fallback only
for local, non-production API development. `APPS_API_HOST=127.0.0.1` keeps that
API private to the local machine. Leave both settings unset in deployments.

Deployment runs on Vercel (web app) + Supabase (Postgres). See [`docs/local-dev-after-clone-guide.md`](./docs/local-dev-after-clone-guide.md) for the full setup including Supabase pooler URLs.
