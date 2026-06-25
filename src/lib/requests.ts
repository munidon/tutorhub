// 요청(requests) 표시용 공용 헬퍼 — 선생님/학부모 페이지가 동일 형식을 쓰도록.
import { kstDateKey, kstTime } from "./datetime";
import type { RequestStatus, RequestType } from "./types";

/** schedules 조인 결과(요청이 가리키는 일정의 현재/이전 시각) */
export type RequestScheduleJoin = {
  starts_at: string;
  ends_at: string;
  prev_starts: string | null;
  prev_ends: string | null;
} | null;

/** "MM/DD HH:MM" 압축 표기 (KST) */
export function compactKST(iso: string): string {
  return `${kstDateKey(iso).slice(5).replace("-", "/")} ${kstTime(iso)}`;
}

/**
 * 요청 상세 문구: 추가/취소 = 언제, 변경 = 전 → 후.
 * 변경은 승인 시 schedule 이 갱신되므로 prev_starts(전)→starts_at(후),
 * 그 외(대기/반려/철회)는 현재 일정(전)→제안 시간(후)으로 표시.
 */
export function requestDetail(
  r: {
    type: RequestType;
    status: RequestStatus;
    proposed_starts: string | null;
    proposed_ends: string | null;
  },
  sch: RequestScheduleJoin,
): string {
  if (r.type === "add") {
    return r.proposed_starts
      ? `추가: ${compactKST(r.proposed_starts)}${r.proposed_ends ? `~${kstTime(r.proposed_ends)}` : ""}`
      : "추가 요청";
  }
  if (r.type === "cancel") {
    return sch
      ? `취소: ${compactKST(sch.starts_at)}~${kstTime(sch.ends_at)}`
      : "취소 요청";
  }
  // change
  const before =
    r.status === "approved"
      ? (sch?.prev_starts ?? null)
      : (sch?.starts_at ?? null);
  const after =
    r.status === "approved" ? (sch?.starts_at ?? null) : r.proposed_starts;
  if (before && after) return `변경: ${compactKST(before)} → ${compactKST(after)}`;
  if (after) return `변경: → ${compactKST(after)}`;
  return "변경 요청";
}
