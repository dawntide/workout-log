import { Suspense } from "react";
import { V2ResetPasswordForm } from "@/components/v2/auth/v2-reset-password-form";

export const metadata = {
  title: "새 비밀번호 · Workout Log",
};

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <V2ResetPasswordForm />
    </Suspense>
  );
}
