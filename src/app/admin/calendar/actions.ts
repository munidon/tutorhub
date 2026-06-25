"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { kstLocalToISO, isHalfHourISO, addMinutesISO } from "@/lib/datetime";
import { isValidDuration } from "@/lib/schedule";

export type CreateScheduleState = { ok?: boolean; error?: string };

/** 선생님이 일정을 직접 추가 (확정 상태로 생성). 시간 겹침은 DB EXCLUDE 제약이 차단. */
export async function createScheduleAction(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  const profile = await requireRole("teacher");

  const studentId = String(formData.get("student_id") ?? "");
  const starts = kstLocalToISO(String(formData.get("starts_at") ?? "") || null);
  const duration = Number(formData.get("duration") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  // 선생님 직접 추가는 정규/추가만 허용
  const category =
    String(formData.get("category") ?? "regular") === "added" ? "added" : "regular";

  if (!studentId) return { error: "학생을 선택하세요." };
  if (!starts) return { error: "시작 시간을 입력하세요." };
  if (!isHalfHourISO(starts))
    return { error: "시작 시간은 30분 단위(정각·30분)로만 설정할 수 있습니다." };
  if (!isValidDuration(duration)) return { error: "수업 시간을 선택하세요." };
  const ends = addMinutesISO(starts, duration);

  const supabase = await createClient();
  const { error } = await supabase.from("schedules").insert({
    student_id: studentId,
    starts_at: starts,
    ends_at: ends,
    status: "confirmed",
    category,
    base_category: category, // 생성 시 원본 구분 고정
    note,
    created_by: profile.id,
  });

  if (error) {
    const msg = error.message.includes("schedules_no_overlap")
      ? "해당 시간대에 이미 다른 수업이 있습니다."
      : error.message;
    return { error: `일정 추가 실패: ${msg}` };
  }

  revalidatePath("/admin/calendar");
  return { ok: true };
}

/** 선생님이 기존 일정 시간을 즉시 변경 (캘린더 클릭 → 변경). */
export async function updateScheduleAction(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  await requireRole("teacher");

  const id = String(formData.get("schedule_id") ?? "");
  const starts = kstLocalToISO(String(formData.get("starts_at") ?? "") || null);
  const duration = Number(formData.get("duration") ?? "");

  if (!id) return { error: "대상 일정이 없습니다." };
  if (!starts) return { error: "시작 시간을 입력하세요." };
  if (!isHalfHourISO(starts))
    return { error: "시작 시간은 30분 단위(정각·30분)로만 설정할 수 있습니다." };
  if (!isValidDuration(duration)) return { error: "수업 시간을 선택하세요." };
  const ends = addMinutesISO(starts, duration);

  const supabase = await createClient();

  // 변경 전 시간 보존 → 구분 '변경'으로 표시 (정산 delta·이력용)
  const { data: before } = await supabase
    .from("schedules")
    .select("starts_at, ends_at")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("schedules")
    .update({
      starts_at: starts,
      ends_at: ends,
      prev_starts: before?.starts_at ?? null,
      prev_ends: before?.ends_at ?? null,
      category: "changed",
    })
    .eq("id", id);

  if (error) {
    const msg = error.message.includes("schedules_no_overlap")
      ? "해당 시간대에 이미 다른 수업이 있습니다."
      : error.message;
    return { error: `변경 실패: ${msg}` };
  }

  revalidatePath("/admin/calendar");
  return { ok: true };
}

/** 선생님이 기존 일정을 즉시 취소 (status=cancelled). */
export async function cancelScheduleAction(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  await requireRole("teacher");

  const id = String(formData.get("schedule_id") ?? "");
  if (!id) return { error: "대상 일정이 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedules")
    .update({ status: "cancelled", category: "cancelled" })
    .eq("id", id);

  if (error) return { error: `취소 실패: ${error.message}` };

  revalidatePath("/admin/calendar");
  return { ok: true };
}

/**
 * 직접 정산(수령 완료) 토글 — 현금 등으로 이미 받은 추가/변경 수업료를
 * 다음 달 이월에서 제외하고 '직접 수령'으로 집계한다.
 */
export async function setScheduleSettledAction(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  await requireRole("teacher");

  const id = String(formData.get("schedule_id") ?? "");
  const settled = String(formData.get("settled") ?? "") === "1";
  if (!id) return { error: "대상 일정이 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedules")
    .update({ settled, settled_at: settled ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) return { error: `정산 처리 실패: ${error.message}` };

  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * 선생님이 잘못 입력한 수업을 완전히 삭제 (행 자체 제거).
 * '취소'(status=cancelled, 정산 반영)와 달리 기록·정산에 남지 않는다.
 */
export async function deleteScheduleAction(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  await requireRole("teacher");

  const id = String(formData.get("schedule_id") ?? "");
  if (!id) return { error: "대상 일정이 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase.from("schedules").delete().eq("id", id);

  if (error) return { error: `삭제 실패: ${error.message}` };

  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  return { ok: true };
}
