import { NextResponse } from "next/server";
import {
  findUserById,
} from "@/server/auth/session";
import { tryAuthenticatedUserId } from "@/server/auth/user";

export async function GET() {
  const userId = await tryAuthenticatedUserId();
  if (!userId) {
    return NextResponse.json({ user: null }, { status: 200 });
  }
  // env fallback일 수 있음 — 그 경우 DB에 user record 없을 수 있어 안전 처리
  const user = await findUserById(userId).catch(() => null);
  if (!user) {
    return NextResponse.json({
      user: {
        id: userId,
        email: null,
        displayName: null,
        emailVerifiedAt: null,
        fallback: true,
      },
    });
  }
  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerifiedAt: user.emailVerifiedAt,
      fallback: false,
    },
  });
}
