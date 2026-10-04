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

  // 시간만 갱신한다. 구분(category)·직전값(prev_*)·이력 기록은
  // DB 트리거(set_schedule_derived / log_schedule_change)가 처리한다.
  // 최초 계획값(origin_*)은 불변이므로 되돌리면 자동으로 '변경 없음'이 된다.
  const { error } = await supabase
    .from("schedules")
    .update({ starts_at: starts, ends_at: ends })
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
    .update({ status: "cancelled" })
    .eq("id", id);

  if (error) return { error: `취소 실패: ${error.message}` };

  revalidatePath("/admin/calendar");
  return { ok: true };
}

/**
 * 변경을 롤백한다 — 최초 계획 시간(origin_*)으로 되돌린다.
 * 트리거가 구분·정산을 다시 계산하므로 '애초에 변경되지 않은' 상태로 완전히 복귀한다.
 * (직접 수령 표시도 함께 해제된다)
 */
export async function revertScheduleAction(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  await requireRole("teacher");

  const id = String(formData.get("schedule_id") ?? "");
  if (!id) return { error: "대상 일정이 없습니다." };

  const supabase = await createClient();

  // 되돌릴 시각은 클라이언트가 아니라 DB 의 origin 에서 읽는다
  const { data: row, error: readErr } = await supabase
    .from("schedules")
    .select("origin_starts_at, origin_ends_at")
    .eq("id", id)
    .single();
  if (readErr || !row) return { error: "대상 일정을 찾을 수 없습니다." };

  const { error } = await supabase
    .from("schedules")
    .update({ starts_at: row.origin_starts_at, ends_at: row.origin_ends_at })
    .eq("id", id);

  if (error) {
    // 비워둔 원래 자리를 그 사이 다른 수업이 차지했을 수 있다
    const msg = error.message.includes("schedules_no_overlap")
      ? "원래 시간대에 이미 다른 수업이 있습니다."
      : error.message;
    return { error: `되돌리기 실패: ${msg}` };
  }

  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * 취소한 수업을 되살린다 (status=confirmed).
 * 구분·정산 대상 여부는 트리거가 origin 기준으로 다시 계산하므로
 * 취소 전 상태가 그대로 복원된다.
 */
export async function restoreScheduleAction(
  _prev: CreateScheduleState,
  formData: FormData,
): Promise<CreateScheduleState> {
  await requireRole("teacher");

  const id = String(formData.get("schedule_id") ?? "");
  if (!id) return { error: "대상 일정이 없습니다." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("schedules")
    .update({ status: "confirmed" })
    .eq("id", id);

  if (error) {
    // 취소된 사이 다른 수업이 그 자리를 차지했을 수 있다
    const msg = error.message.includes("schedules_no_overlap")
      ? "해당 시간대에 이미 다른 수업이 있습니다."
      : error.message;
    return { error: `취소 해제 실패: ${msg}` };
  }

  revalidatePath("/admin/calendar");
  revalidatePath("/admin");
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
 * schedule_changes 의 변경 이력도 on delete cascade 로 함께 사라진다 — 의도된 동작.
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

/**
 * 캘린더 구독(webcal) 토큰을 발급/조회. studentId === "all" 이면 전체 학생 토큰(settings),
 * 그 외에는 해당 학생 토큰(students)을 대상으로 한다.
 * 이미 있으면 그대로 반환, 없으면 추측 불가능한 비밀 토큰을 생성해 저장한다.
 * 이 토큰이 담긴 /api/calendar/<token> 은 인증 없이 접근되므로 노출에 주의.
 */
export async function ensureCalendarTokenAction(
  studentId: string,
): Promise<{ token?: string; error?: string }> {
  await requireRole("teacher");
  if (!studentId) return { error: "학생 정보가 없습니다." };

  const supabase = await createClient();
  const newToken = () => crypto.randomUUID().replace(/-/g, "");

  // 전체 학생 구독 — settings 싱글톤에 토큰 저장
  if (studentId === "all") {
    const { data: settings, error: readErr } = await supabase
      .from("settings")
      .select("calendar_token")
      .eq("id", 1)
      .single();
    if (readErr) return { error: `조회 실패: ${readErr.message}` };
    if (settings?.calendar_token) return { token: settings.calendar_token };

    const token = newToken();
    const { error: writeErr } = await supabase
      .from("settings")
      .update({ calendar_token: token })
      .eq("id", 1);
    if (writeErr) return { error: `발급 실패: ${writeErr.message}` };
    return { token };
  }

  // 개별 학생 구독 — students 행에 토큰 저장
  const { data: student, error: readErr } = await supabase
    .from("students")
    .select("calendar_token")
    .eq("id", studentId)
    .single();
  if (readErr) return { error: `조회 실패: ${readErr.message}` };
  if (student?.calendar_token) return { token: student.calendar_token };

  const token = newToken();
  const { error: writeErr } = await supabase
    .from("students")
    .update({ calendar_token: token })
    .eq("id", studentId);
  if (writeErr) return { error: `발급 실패: ${writeErr.message}` };

  return { token };
}
