"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type PaymentActionState = { ok?: boolean; error?: string };

/**
 * 선생님: 학생×월 입금 확인 토글.
 * paid='1' → payments 에 행 생성(확인), '0' → 행 삭제(확인 취소).
 * 학부모 청구서(/calendar)와 정산 대시보드(/admin)에 반영.
 */
export async function setPaymentAction(
  _prev: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const profile = await requireRole("teacher");

  const studentId = String(formData.get("student_id") ?? "");
  const ym = String(formData.get("ym") ?? "");
  const paid = String(formData.get("paid") ?? "") === "1";

  if (!studentId || !/^\d{4}-\d{2}$/.test(ym)) {
    return { error: "대상 정보가 올바르지 않습니다." };
  }

  const supabase = await createClient();

  if (paid) {
    const { error } = await supabase
      .from("payments")
      .upsert(
        { student_id: studentId, ym, confirmed_by: profile.id, confirmed_at: new Date().toISOString() },
        { onConflict: "student_id,ym" },
      );
    if (error) return { error: `입금 확인 실패: ${error.message}` };
  } else {
    const { error } = await supabase
      .from("payments")
      .delete()
      .eq("student_id", studentId)
      .eq("ym", ym);
    if (error) return { error: `입금 확인 취소 실패: ${error.message}` };
  }

  revalidatePath("/admin");
  revalidatePath("/calendar");
  return { ok: true };
}
