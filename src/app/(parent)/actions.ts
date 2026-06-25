"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { kstLocalToISO, isHalfHourISO, addMinutesISO } from "@/lib/datetime";
import { isValidDuration } from "@/lib/schedule";

export type RequestActionState = { ok?: boolean; error?: string };

/**
 * 학부모의 일정 조율 요청 생성 (add/change/cancel).
 * RLS(requests_insert)가 본인 자녀 + 본인 명의 요청만 허용한다.
 * useActionState 시그니처 → 제출 중 버튼 비활성화로 중복 전송(광클) 방지.
 */
export async function createRequestAction(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const profile = await getCurrentProfile();
  if (profile.role !== "parent") return { error: "권한이 없습니다." };

  const type = String(formData.get("type") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const scheduleId = formData.get("schedule_id")
    ? String(formData.get("schedule_id"))
    : null;
  const proposedStarts = kstLocalToISO(
    (formData.get("proposed_starts") as string) || null,
  );
  const duration = Number(formData.get("duration") ?? "");
  // 시작 + 수업 시간 → 종료 계산
  const proposedEnds =
    proposedStarts && isValidDuration(duration)
      ? addMinutesISO(proposedStarts, duration)
      : null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!studentId || !["add", "change", "cancel"].includes(type))
    return { error: "요청 정보가 올바르지 않습니다." };
  if (
    (type === "add" || type === "change") &&
    (!isHalfHourISO(proposedStarts) || !proposedEnds)
  ) {
    return { error: "시작/수업 시간을 확인하세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("requests").insert({
    student_id: studentId,
    schedule_id: scheduleId,
    type,
    proposed_starts: proposedStarts,
    proposed_ends: proposedEnds,
    note,
    requested_by: profile.id,
  });

  if (error) return { error: `요청 실패: ${error.message}` };
  revalidatePath("/calendar");
  revalidatePath("/requests");
  return { ok: true };
}

/**
 * 학부모: 본인이 보낸 '대기 중' 요청을 철회(withdrawn).
 *
 * status='pending' 가드 + 원자적 UPDATE. 선생님이 이미 승인/반려했으면 0행이 갱신되어
 * 실패를 안내한다(하드 삭제하지 않으므로 결정과 경합해도 손실/불일치 없음).
 * 성공 시에만 revalidate — 실패 시엔 카드/버튼을 남겨 에러 메시지를 보여준다.
 */
export async function withdrawRequestAction(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const profile = await getCurrentProfile();
  if (profile.role !== "parent") return { error: "권한이 없습니다." };

  const id = String(formData.get("request_id") ?? "");
  if (!id) return { error: "요청 정보가 없습니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("requests")
    .update({ status: "withdrawn", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending") // 가드: 대기 중일 때만 (RLS 도 동일 조건 강제)
    .select("id");

  if (error) return { error: `취소 실패: ${error.message}` };
  if (!data || data.length === 0) {
    return { error: "이미 선생님이 처리한 요청이라 취소할 수 없습니다." };
  }

  revalidatePath("/requests");
  revalidatePath("/calendar");
  return { ok: true };
}

/** 학부모: 캘린더에서 기존 수업 클릭 → 시간 변경 요청 (pending). */
export async function requestChangeAction(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const profile = await getCurrentProfile();
  if (profile.role !== "parent") return { error: "권한이 없습니다." };

  const scheduleId = String(formData.get("schedule_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  const starts = kstLocalToISO(String(formData.get("starts_at") ?? "") || null);
  const duration = Number(formData.get("duration") ?? "");

  if (!scheduleId || !studentId) return { error: "대상 일정 정보가 없습니다." };
  if (!starts) return { error: "변경할 시작 시간을 입력하세요." };
  if (!isHalfHourISO(starts))
    return { error: "시작 시간은 30분 단위(정각·30분)로만 설정할 수 있습니다." };
  if (!isValidDuration(duration)) return { error: "수업 시간을 선택하세요." };
  const ends = addMinutesISO(starts, duration);

  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("requests").insert({
    student_id: studentId,
    schedule_id: scheduleId,
    type: "change",
    proposed_starts: starts,
    proposed_ends: ends,
    note,
    requested_by: profile.id,
  });

  if (error) return { error: `요청 실패: ${error.message}` };
  revalidatePath("/calendar");
  revalidatePath("/requests");
  return { ok: true };
}

/** 학부모: 캘린더에서 기존 수업 클릭 → 취소 요청 (pending). */
export async function requestCancelAction(
  _prev: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const profile = await getCurrentProfile();
  if (profile.role !== "parent") return { error: "권한이 없습니다." };

  const scheduleId = String(formData.get("schedule_id") ?? "");
  const studentId = String(formData.get("student_id") ?? "");
  if (!scheduleId || !studentId) return { error: "대상 일정 정보가 없습니다." };

  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("requests").insert({
    student_id: studentId,
    schedule_id: scheduleId,
    type: "cancel",
    note,
    requested_by: profile.id,
  });

  if (error) return { error: `요청 실패: ${error.message}` };
  revalidatePath("/calendar");
  revalidatePath("/requests");
  return { ok: true };
}
