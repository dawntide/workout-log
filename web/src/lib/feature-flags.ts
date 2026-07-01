// 피처 플래그. NEXT_PUBLIC_* 이므로 클라이언트 번들에 빌드 시점에 인라인된다.

/**
 * 이메일 복구 UI(로그인의 "비밀번호 잊음" 링크, 이메일 인증 배너, 설정의 이메일 인증 섹션)
 * 노출 여부.
 *
 * 이 UI들은 Resend 발송 인프라(`RESEND_API_KEY`/`RESEND_FROM`, 서버)가 있어야 실제로
 * 동작한다. 인프라가 없으면 링크를 눌러도 메일이 나가지 않아 "죽은 플로우"가 되므로 기본은
 * 숨긴다(현재 프로덕션 상태 = 미설정).
 *
 * 활성화(도메인 확보 후): 발송 도메인 인증 → Vercel Production에
 *   RESEND_API_KEY, RESEND_FROM, NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED=1
 * 을 넣고 재배포하면 UI가 다시 나타난다. **코드 변경 불필요**(env "키입력"만).
 *
 * ⚠️ NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED만 켜고 RESEND_*를 빠뜨리면 UI는 보이지만 메일이
 *    조용히 실패한다 — 반드시 함께 설정할 것.
 */
export function isEmailRecoveryEnabled(): boolean {
  return process.env.NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED === "1";
}
