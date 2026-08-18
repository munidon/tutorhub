import type { Schedule } from "./types";
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

// ── 변경 판정 ────────────────────────────────────────────────
// 기준은 '직전 값'이 아니라 '최초 계획값'(origin_*, DB 트리거가 불변으로 고정).
// 따라서 옮겼다가 되돌리면 자동으로 '변경 없음'이 된다.

const HOUR_MS = 3_600_000;
const EPS = 1e-9;

export type BillingInput = Pick<
  Schedule,
  | "starts_at"
  | "ends_at"
  | "status"
  | "base_category"
  | "origin_starts_at"
  | "origin_ends_at"
  | "settled"
>;

/** 정산 계산에 필요한 최소 스키마 — 전체 Schedule 대신 클라이언트로 보낼 때 사용 */
export type BillingSchedule = BillingInput & { student_id: string };

function sameTime(a: string, b: string): boolean {
  return new Date(a).getTime() === new Date(b).getTime();
}

function durHours(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / HOUR_MS;
}

/** 당초 계획된 길이 (origin 기준) */
function plannedHours(s: BillingInput): number {
  return durHours(s.origin_starts_at, s.origin_ends_at);
}

/** 실제로 잡혀 있는 현재 길이 */
function actualHours(s: BillingInput): number {
  return durHours(s.starts_at, s.ends_at);
}

/** 최초 계획과 시간(시작 또는 길이)이 다른가 */
export function isChanged(s: BillingInput): boolean {
  return (
    !sameTime(s.starts_at, s.origin_starts_at) ||
    !sameTime(s.ends_at, s.origin_ends_at)
  );
}

function ymOf(iso: string): [number, number] {
  const [y, m] = kstDateKey(iso).split("-").map(Number);
  return [y, m];
}

function isInMonth(iso: string, year: number, month: number): boolean {
  const [y, m] = ymOf(iso);
  return y === year && m === month;
}

/** 계획된 달을 벗어나 다른 달로 옮겨졌는가 (= 이월) */
export function movedAcrossMonths(s: BillingInput): boolean {
  if (s.status !== "confirmed") return false;
  const [oy, om] = ymOf(s.origin_starts_at);
  const [cy, cm] = ymOf(s.starts_at);
  return oy !== cy || om !== cm;
}

/** 계획된 달에 남기는 '빠져나감' 표시용 라벨 (실제 수업은 다른 달에 있음) */
export const CARRIED_OUT_TAG = "취소-이월";

/**
 * 캘린더 칩 라벨. 저장된 category 가 아니라 origin 대비 계산으로 도출한다.
 * 우선순위: 취소 > 추가 > 이월 > 변경. (정규·무변경은 라벨 없음)
 */
export function scheduleTag(s: BillingInput): string | undefined {
  if (s.status === "cancelled") return "취소";
  // 추가 수업은 옮겨도 '추가'가 정산상 더 중요한 사실이므로 유지
  if (s.base_category === "added") return "추가";
  if (movedAcrossMonths(s)) return "이월";
  if (isChanged(s)) return "변경";
  return undefined;
}

// ── 정산(수업료) 계산 ────────────────────────────────────────
// 정규시간은 '당초 계획'(origin_starts_at 의 달, base_category='regular') 기준 —
// 취소·변경·이월돼도 계획된 달에 그대로 유지된다.
//
// 조정(이월)은 수업 하나가 두 달에 걸쳐 기여할 수 있다:
//   계획된 달: (추가면 +planned) − planned
//   실제 달  : 취소가 아니면 + actual
// 같은 달 안의 변경이면 두 항이 합쳐져 (actual − planned) = 기존 delta 가 되고,
// 요일·시각만 옮긴 경우엔 0 이 되어 정산 대상에서 빠진다.

export type ChangeBreakdown = {
  addedHours: number; // 추가 (+)
  changedDelta: number; // 변경·이월 (±)
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

/** 해당 월에 이 수업이 만드는 조정(이월) 기여 — 부호 있음 */
export function adjustmentIn(
  s: BillingInput,
  year: number,
  month: number,
): number {
  const inOrigin = isInMonth(s.origin_starts_at, year, month);
  const inCurrent = isInMonth(s.starts_at, year, month);
  let v = 0;
  // 추가 수업은 정규시간에 안 잡히므로 계획된 달에 조정으로 먼저 더한다
  if (s.base_category === "added" && inOrigin) v += plannedHours(s);
  // 계획된 달에서 빼고, 실제로 열린 달에 더한다
  if (inOrigin) v -= plannedHours(s);
  if (s.status === "confirmed" && inCurrent) v += actualHours(s);
  return v;
}

/** 어느 달에서든 조정 기여가 0 이 아닌가 → '수업료 수령 처리' 대상 여부 */
export function hasAdjustment(s: BillingInput): boolean {
  const [oy, om] = ymOf(s.origin_starts_at);
  if (Math.abs(adjustmentIn(s, oy, om)) > EPS) return true;
  const [cy, cm] = ymOf(s.starts_at);
  if (oy === cy && om === cm) return false;
  return Math.abs(adjustmentIn(s, cy, cm)) > EPS;
}

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
    const inOrigin = isInMonth(s.origin_starts_at, year, month);
    const inCurrent = isInMonth(s.starts_at, year, month);
    if (!inOrigin && !inCurrent) continue;

    // 정규로 계획된 수업은 취소·변경·이월돼도 계획된 달의 정규시간에 유지
    if (s.base_category === "regular" && inOrigin) {
      regularHours += plannedHours(s);
    }

    const contrib = adjustmentIn(s, year, month);

    // 표시용 3분류: 추가/취소를 먼저 떼고 나머지를 '변경·이월'로
    const added =
      s.base_category === "added" && s.status === "confirmed" && inCurrent
        ? actualHours(s)
        : 0;
    const cancelled =
      s.base_category === "regular" && s.status === "cancelled" && inOrigin
        ? plannedHours(s)
        : 0;
    addedHours += added;
    cancelledHours += cancelled;
    changedDelta += contrib - added + cancelled;

    if (Math.abs(contrib) > EPS) {
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
