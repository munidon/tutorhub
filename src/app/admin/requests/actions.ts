"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type DecideActionState = { ok?: boolean; error?: string };

/**
 * 요청 승인/반려 — decide_request RPC(security definer)로 원자적 처리.
 *
 * RPC 는 행을 FOR UPDATE 로 잠그고 status='pending' 가드를 건다. 학부모가 먼저 철회했거나
 * 이미 결정된 요청이면 예외가 나는데, 그걸 안내 메시지로 표면화한다(경합에서 진 경우).
 * 성공 시에만 revalidate — 실패 시엔 카드를 남겨 메시지를 보여준다.
 */
export async function decideRequestAction(
  _prev: DecideActionState,
  formData: FormData,
): Promise<DecideActionState> {
  await requireRole("teacher");

  const id = String(formData.get("request_id") ?? "");
  const decision = String(formData.get("decision") ?? ""); // 'approved' | 'rejected'
  const reason = String(formData.get("reason") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_request", {
    p_request_id: id,
    p_decision: decision,
    p_reason: reason,
  });

  if (error) {
    const already = /already decided|not found/i.test(error.message);
    return {
      error: already
        ? "이미 처리된 요청입니다. (학부모가 철회했거나 이미 결정됨) — 새로고침해 주세요."
        : `처리 실패: ${error.message}`,
    };
  }

  revalidatePath("/admin/requests");
  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  return { ok: true };
}
