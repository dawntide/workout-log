import { NextResponse } from "next/server";
import {
  findUserById,
} from "@workout/core/auth/session";
import { tryAuthenticatedUserId } from "@/server/auth/user";
import { isImpersonating } from "@/server/auth/impersonation";

export async function GET() {
  const userId = await tryAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  // 전환 배너의 노출 조건. 쿠키 존재만 보므로 추가 조회가 없다 — 복귀 가능 여부는
  // 복귀 라우트가 판정하고, 만료됐다면 거기서 재로그인을 안내한다.
  const impersonating = await isImpersonating();
  // env fallback일 수 있음 — 그 경우 DB에 user record 없을 수 있어 안전 처리
  const user = await findUserById(userId).catch(() => null);
  if (!user) {
    return NextResponse.json({
      user: {
        id: userId,
        email: null,
        displayName: null,
        // 계정 행이 없으면 권한도 없다. 클라이언트의 관리자 UI 노출 판단이 이 값을
        // 쓰지만, 실제 경계는 서버(requireAdminUserId·isAdminRequest)가 잡는다.
        role: "user",
        emailVerifiedAt: null,
        fallback: true,
        impersonating,
      },
    });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt,
      fallback: false,
      impersonating,
    },
  });
}
