import { Suspense } from "react";
import { V2AuthForm } from "@/components/v2/v2-auth-form";
import { TerminalLoginBanner } from "@/components/v2/terminal-login-banner";

export const metadata = {
  title: "가입 · Workout Log",
};

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <TerminalLoginBanner />
      <V2AuthForm mode="signup" />
    </Suspense>
  );
}
