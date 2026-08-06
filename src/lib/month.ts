// KST 기준 월 산술 + 캘린더 조회 창(window) 계산 헬퍼.
// 캘린더는 중심 월(?ym=) 주변만 조회하고, 창 밖으로 이동하면 서버 네비게이션한다.

const pad = (n: number) => String(n).padStart(2, "0");

/** [year, month] → "YYYY-MM" */
export function ymKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

/** "YYYY-MM" → [year, month] (형식이 어긋나면 null) */
export function parseYm(ym: string | undefined): [number, number] | null {
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [y, m] = ym.split("-").map(Number);
  return m >= 1 && m <= 12 ? [y, m] : null;
}

/** 월 더하기/빼기 */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): [number, number] {
  const total = year * 12 + (month - 1) + delta;
  return [Math.floor(total / 12), (total % 12) + 1];
}

/** 해당 월 1일 0시(KST)를 ISO(UTC) 문자열로 — starts_at 범위 필터용 */
export function kstMonthStartISO(year: number, month: number): string {
  return new Date(`${ymKey(year, month)}-01T00:00:00+09:00`).toISOString();
}

/**
 * 중심 월 기준 캘린더 조회 창.
 * - 화면에서 즉시 이동 가능한 월: 전월 ~ +2개월 (viewMinYm ~ viewMaxYm)
 * - 조회 범위: 전전월 ~ +3개월 미만 — 표시 가능한 모든 월의 정산(전월 이월)까지 커버
 */
export function calendarWindow(year: number, month: number) {
  const [minY, minM] = addMonths(year, month, -1);
  const [maxY, maxM] = addMonths(year, month, 2);
  const [fetchY, fetchM] = addMonths(year, month, -2);
  const [endY, endM] = addMonths(year, month, 3);
  const viewYms: string[] = [];
  for (let d = -1; d <= 2; d++) {
    const [y, m] = addMonths(year, month, d);
    viewYms.push(ymKey(y, m));
  }
  return {
    viewMinYm: ymKey(minY, minM),
    viewMaxYm: ymKey(maxY, maxM),
    viewYms, // 화면 이동 가능한 4개 월의 "YYYY-MM" 목록 (입금 확인 조회용)
    fetchStartISO: kstMonthStartISO(fetchY, fetchM),
    fetchEndISO: kstMonthStartISO(endY, endM),
  };
}
