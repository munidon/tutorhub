import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

/**
 * 현재 로그인 사용자의 프로필을 반환. 미로그인 시 /login 으로 리다이렉트.
 * getClaims() 로 JWT 를 로컬 검증하므로 Auth 서버 왕복이 없고,
 * React.cache 로 같은 요청(렌더 패스) 안에서는 1회만 실행된다.
 */
export const getCurrentProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = error ? null : data?.claims.sub;

  if (!userId) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (!profile) redirect("/login");
  return profile as Profile;
});

/** 특정 역할만 허용. 권한 없으면 해당 역할 홈으로 보낸다. */
export async function requireRole(role: Role): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (profile.role !== role) {
    redirect(profile.role === "teacher" ? "/admin" : "/calendar");
  }
  return profile;
}

/** 역할별 기본 홈 경로 */
export function homePathFor(role: Role): string {
  return role === "teacher" ? "/admin" : "/calendar";
}
