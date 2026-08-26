import { Pool } from "pg";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: "C:/Dev/personal/workout-log/web/.env.local", quiet: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const OWNER_EMAIL = "sharru0701@gmail.com";

// 안전장치: 센티널(로그인 불가 폴백) 계정은 절대 승격 대상이 아니다.
const target = await pool.query(
  `select id, email, role, password_hash = 'local-dev-no-login' as is_sentinel
   from public.app_user where email = $1`,
  [OWNER_EMAIL],
);
console.log("[대상]", target.rows);

if (target.rowCount !== 1) {
  console.log("[중단] 정확히 1행이 아니라 승격하지 않는다:", target.rowCount);
} else if (target.rows[0].is_sentinel) {
  console.log("[중단] 센티널 계정이라 승격하지 않는다");
} else {
  const res = await pool.query(
    `update public.app_user set role='admin'
     where email = $1 and password_hash <> 'local-dev-no-login'
     returning id, email, role`,
    [OWNER_EMAIL],
  );
  console.log("[승격됨]", res.rowCount, res.rows);
}

const dist = await pool.query(
  `select role, count(*)::int as n from public.app_user group by role order by role`,
);
console.log("[prod role 분포]", dist.rows);

await pool.end();
