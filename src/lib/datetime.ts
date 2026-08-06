// 시간대 헬퍼 — 저장은 UTC(timestamptz), 표시/입력은 Asia/Seoul 고정.
// Intl.DateTimeFormat 생성은 매우 비싸므로(로케일·타임존 데이터 해석)
// 모듈 레벨 싱글턴으로 만들어 재사용한다 — 달력 루프에서 수백 회 호출됨.

const KST = "Asia/Seoul";

const FMT_DEFAULT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  dateStyle: "medium",
  timeStyle: "short",
});

const FMT_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const FMT_WEEKDAY = new Intl.DateTimeFormat("ko-KR", {
  timeZone: KST,
  weekday: "short",
});

const FMT_TIME_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: KST,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const FMT_LOCAL_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO(UTC) 문자열을 한국 시간 표기로 변환 */
export function formatKST(
  iso: string,
  opts?: Intl.DateTimeFormatOptions,
): string {
  const fmt = opts
    ? new Intl.DateTimeFormat("ko-KR", {
        timeZone: KST,
        dateStyle: "medium",
        timeStyle: "short",
        ...opts,
      })
    : FMT_DEFAULT;
  return fmt.format(new Date(iso));
}

/** datetime-local 입력값("YYYY-MM-DDTHH:MM")을 KST 기준으로 해석해 ISO(UTC)로 변환 */
export function kstLocalToISO(local: string | null): string | null {
  if (!local) return null;
  return new Date(`${local}:00+09:00`).toISOString();
}

/** ISO(UTC) → KST 기준 날짜 키 "YYYY-MM-DD" (달력 버킷팅용) */
export function kstDateKey(iso: string): string {
  const parts = FMT_DATE_PARTS.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** ISO(UTC) → KST 기준 한글 요일 한 글자("일"~"토") */
export function kstWeekday(iso: string): string {
  return FMT_WEEKDAY.format(new Date(iso));
}

/** ISO(UTC) → KST 기준 "HH:MM" (24시간제) */
export function kstTime(iso: string): string {
  const parts = FMT_TIME_PARTS.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("hour")}:${get("minute")}`;
}

/** ISO(UTC) 에 분(minutes)을 더한 ISO(UTC) */
export function addMinutesISO(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** ISO(UTC) 시각이 정각/30분 단위인지 (수업은 30분 단위만 허용) */
export function isHalfHourISO(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getUTCMinutes() % 30 === 0;
}

/** ISO(UTC) → datetime-local 입력값("YYYY-MM-DDTHH:MM", KST 기준) */
export function isoToKstLocal(iso: string): string {
  const parts = FMT_LOCAL_PARTS.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
