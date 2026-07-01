import { Suspense } from "react";
import { redirect } from "next/navigation";
import { V2ResetPasswordForm } from "@/components/v2/auth/v2-reset-password-form";
import { isEmailRecoveryEnabled } from "@/lib/feature-flags";

export const metadata = {
  title: "새 비밀번호 · Workout Log",
};

export default function ResetPasswordPage() {
  // 이메일 복구 미설정 시 죽은 플로우 → 로그인으로. (활성화는 feature-flags.ts 참고)
  if (!isEmailRecoveryEnabled()) redirect("/login");
  return (
    <Suspense fallback={null}>
      <V2ResetPasswordForm />
    </Suspense>
  );
}
