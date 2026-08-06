import type { Schedule, ScheduleStatus, ScheduleCategory } from "./types";
import { kstDateKey } from "./datetime";

// ── 수업 시간(duration) ──────────────────────────────────────
/** 수업 시간 옵션(분): 1시간 ~ 6시간, 30분 단위 */
export const DURATION_OPTIONS = Array.from({ length: 11 }, (_, i) => 60 + i * 30);

/** 분 → "1시간" / "1시간 30분" 라벨 */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

/** 임의 분을 30분 단위로 반올림하고 60~360 으로 클램프 (모달 프리필용) */
export function snapDurationMinutes(minutes: number): number {
  const snapped = Math.round(minutes / 30) * 30;
  return Math.min(360, Math.max(60, snapped));
}

/** duration 값이 유효한지(60~360, 30분 단위) */
export function isValidDuration(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= 60 &&
    minutes <= 360 &&
    minutes % 30 === 0
  );
}

/** 캘린더 칩에 붙일 수업 구분 라벨 (정규는 라벨 없음). */
export function categoryTag(
  status: ScheduleStatus,
  category: ScheduleCategory,
): string | undefined {
  if (status === "cancelled") return "취소";
  if (category === "added") return "추가";
  if (category === "changed") return "변경";
  return undefined;
}

// ── 정산(수업료) 계산 ────────────────────────────────────────
// 정규시간은 '당초 계획'(base_category='regular') 기준 — 취소/변경돼도 유지.
// 취소/변경 효과는 이월(변경시간)에만 반영. 부호: 추가(+)/취소(−), 변경=(후−전).
// 정규 수업료 = 정규시간×시급 + 전월 이월,  이월 수업료 = 변경시간×시급.

const HOUR_MS = 3_600_000;

export type BillingInput = Pick<
  Schedule,
  | "starts_at"
  | "ends_at"
  | "status"
  | "category"
  | "base_category"
  | "prev_starts"
  | "prev_ends"
  | "settled"
>;

/** 정산 계산에 필요한 최소 스키마 — 전체 Schedule 대신 클라이언트로 보낼 때 사용 */
export type BillingSchedule = BillingInput & { student_id: string };

function durHours(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / HOUR_MS;
}

/** 당초 계획된 길이(변경됐으면 변경 전, 아니면 현재) */
function plannedHours(s: BillingInput): number {
  return s.prev_starts && s.prev_ends
    ? durHours(s.prev_starts, s.prev_ends)
    : durHours(s.starts_at, s.ends_at);
}

function isInMonth(iso: string, year: number, month: number): boolean {
  const [y, m] = kstDateKey(iso).split("-").map(Number);
  return y === year && m === month;
}

export type ChangeBreakdown = {
  addedHours: number; // 추가 (+)
  changedDelta: number; // 변경 (후−전, ±)
  cancelledHours: number; // 취소 (양수 크기)
  changeHours: number; // 총합 = added + changedDelta − cancelled
};

type MonthTotals = ChangeBreakdown & {
  regularHours: number;
  // 이월에 실제로 반영되는(아직 정산 안 된) 변경 시간 — 변경 수업료(carry) 계산용
  unsettledChangeHours: number;
  anySettled: boolean; // 정산 완료된 조정분이 하나라도 있는가
  anyUnsettled: boolean; // 정산 안 된 조정분이 하나라도 있는가
};

function monthTotals(
  schedules: BillingInput[],
  year: number,
  month: number,
): MonthTotals {
  let regularHours = 0;
  // 변경 수업시간(표시용)은 정산 여부와 무관하게 모든 조정분 반영
  let addedHours = 0;
  let changedDelta = 0;
  let cancelledHours = 0;
  // 이월 수업료는 아직 정산 안 된 조정분만 반영
  let unsettledChangeHours = 0;
  let anySettled = false;
  let anyUnsettled = false;

  for (const s of schedules) {
    if (!isInMonth(s.starts_at, year, month)) continue;

    let contrib = 0; // 이 수업의 변경 기여(부호 있음)
    let isAdjustment = false;

    if (s.base_category === "regular") {
      // 정규로 계획된 수업은 취소/변경돼도 당초 계획 시간을 정규시간에 유지
      regularHours += plannedHours(s);
      if (s.status === "cancelled") {
        cancelledHours += plannedHours(s);
        contrib = -plannedHours(s);
        isAdjustment = true;
      } else if (s.category === "changed") {
        const delta = durHours(s.starts_at, s.ends_at) - plannedHours(s);
        changedDelta += delta;
        contrib = delta;
        isAdjustment = true;
      }
    } else if (s.status === "confirmed") {
      // 추가로 생성된 수업: 정규시간 미포함, 변경(추가)으로만
      const d = durHours(s.starts_at, s.ends_at);
      addedHours += d;
      contrib = d;
      isAdjustment = true;
    }

    if (isAdjustment) {
      if (s.settled) anySettled = true;
      else {
        anyUnsettled = true;
        unsettledChangeHours += contrib; // 미정산분만 이월에 반영
      }
    }
  }

  return {
    regularHours,
    addedHours,
    changedDelta,
    cancelledHours,
    changeHours: addedHours + changedDelta - cancelledHours,
    unsettledChangeHours,
    anySettled,
    anyUnsettled,
  };
}

export type StudentBilling = {
  rate: number | null;
  regularHours: number;
  breakdown: ChangeBreakdown; // 변경 수업시간(모든 조정분 반영)
  prevCarry: number | null; // 전월 이월 수업료(미정산분)
  regularFee: number | null; // 정규시간×시급 + 전월 이월
  carry: number | null; // 이월 수업료 = 미정산 변경시간×시급 (다음 달로)
  allChangesSettled: boolean; // 이번 달 변경분을 모두 직접 정산했는가 → 멘트 표시용
};

/** 한 학생의 해당 월 정산을 수업 기록에서 계산. */
export function computeBilling(
  schedules: BillingInput[],
  rate: number | null,
  year: number,
  month: number,
): StudentBilling {
  const totals = monthTotals(schedules, year, month);

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  // 전월에서 넘어오는 이월도 미정산분만
  const prevUnsettled = monthTotals(schedules, prevYear, prevMonth)
    .unsettledChangeHours;

  const {
    regularHours,
    unsettledChangeHours,
    anySettled,
    anyUnsettled,
    ...breakdown
  } = totals;
  const prevCarry = rate == null ? null : Math.round(prevUnsettled * rate);
  const carry = rate == null ? null : Math.round(unsettledChangeHours * rate);
  const regularFee =
    rate == null ? null : Math.round(regularHours * rate + (prevCarry ?? 0));
  // 변경분이 있었고, 전부 정산 완료(미정산 0)일 때만 멘트
  const allChangesSettled = anySettled && !anyUnsettled;

  return { rate, regularHours, breakdown, prevCarry, regularFee, carry, allChangesSettled };
}

/** 현재 KST 연/월 */
export function currentKstYearMonth(): [number, number] {
  const [y, m] = kstDateKey(new Date().toISOString()).split("-").map(Number);
  return [y, m];
}
