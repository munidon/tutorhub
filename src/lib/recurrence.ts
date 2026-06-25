// 반복 템플릿 표시/파싱 공용 헬퍼.

/** 0=일 … 6=토 (JS Date.getDay 기준) */
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** 자정부터의 분 → "HH:MM" */
export function minutesToHHMM(startMinute: number): string {
  const h = Math.floor(startMinute / 60);
  const m = startMinute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" → 자정부터의 분 (실패 시 null) */
export function hhmmToMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min >= 0 && min <= 1439 ? min : null;
}

/** 템플릿 한 줄 라벨: "월 16:00 (2시간)" */
export function templateLabel(
  weekday: number,
  startMinute: number,
  durationLabel: string,
): string {
  return `${WEEKDAY_LABELS[weekday] ?? "?"} ${minutesToHHMM(startMinute)} (${durationLabel})`;
}
