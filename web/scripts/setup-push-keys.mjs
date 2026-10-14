#!/usr/bin/env node
/**
 * 휴식 종료 푸시용 VAPID 키를 한 번 만든다(migle-board scripts/setup-push.mjs와 같은 방식).
 *
 *   node web/scripts/setup-push-keys.mjs --subject mailto:you@example.com
 *
 * 결과는 `.push-keys.json`(git 제외, 0600)에 쓰고 값을 화면에 찍지 않는다. 세 값을 Vercel
 * env(Production)에 넣고 재배포하면 기능이 켜진다. **키를 바꾸면 모든 기기가 알림을 다시
 * 켜야 한다** — 기존 파일이 있으면 덮어쓰지 않는다.
 */
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const subjectIndex = args.indexOf("--subject");
const subject = subjectIndex >= 0 ? args[subjectIndex + 1] : undefined;
if (!subject || !/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) {
  console.error("Usage: node web/scripts/setup-push-keys.mjs --subject mailto:you@example.com");
  process.exit(1);
}

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const jwk = privateKey.export({ format: "jwk" });
const values = {
  VAPID_PUBLIC_KEY: Buffer.concat([
    Buffer.from([4]),
    Buffer.from(jwk.x, "base64url"),
    Buffer.from(jwk.y, "base64url"),
  ]).toString("base64url"),
  VAPID_PRIVATE_KEY: jwk.d,
  VAPID_SUBJECT: subject,
};

const target = resolve(".push-keys.json");
try {
  writeFileSync(target, JSON.stringify(values, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  console.log(`Created ${target}. 값은 출력하지 않습니다. Vercel env에 옮긴 뒤 파일을 안전하게 보관하세요.`);
} catch (error) {
  console.error(
    error.code === "EEXIST"
      ? "이미 파일이 있습니다. 키 교체는 모든 기기의 재구독이 필요하니 의도적으로만 하세요."
      : "키 파일을 저장하지 못했습니다.",
  );
  process.exitCode = 1;
}
