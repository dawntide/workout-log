import { redirect } from "next/navigation";
import { V2ForgotPasswordForm } from "@/components/v2/auth/v2-forgot-password-form";
import { isEmailRecoveryEnabled } from "@/lib/feature-flags";

export const metadata = {
  title: "비밀번호 재설정 · Workout Log",
};

export default function ForgotPasswordPage() {
  // 이메일 복구 인프라(Resend)가 없으면(기본) 죽은 플로우이므로 로그인으로 돌려보낸다.
  // NEXT_PUBLIC_EMAIL_RECOVERY_ENABLED=1 + RESEND_* 설정 후 재배포하면 다시 노출된다.
  if (!isEmailRecoveryEnabled()) redirect("/login");
  return <V2ForgotPasswordForm />;
}
