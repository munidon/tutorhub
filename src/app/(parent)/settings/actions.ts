"use server";

import { createClient } from "@/lib/supabase/server";

export type PasswordActionState = { ok?: boolean; error?: string };

/**
 * 학부모 본인 비밀번호 변경 (기존/새/새 확인).
 * 현재 비밀번호는 재인증(signInWithPassword)으로 검증한 뒤 변경한다.
 */
export async function changePasswordAction(
  _prev: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "로그인이 필요합니다." };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!current) return { error: "현재 비밀번호를 입력하세요." };
  if (next.length < 6) return { error: "새 비밀번호는 6자 이상이어야 합니다." };
  if (next !== confirm) return { error: "새 비밀번호가 일치하지 않습니다." };
  if (next === current) return { error: "기존과 다른 비밀번호를 입력하세요." };

  // 현재 비밀번호 확인 (재인증)
  const { error: signErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (signErr) return { error: "현재 비밀번호가 일치하지 않습니다." };

  const { error: updErr } = await supabase.auth.updateUser({ password: next });
  if (updErr) return { error: `변경 실패: ${updErr.message}` };

  return { ok: true };
}
