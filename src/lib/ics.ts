// iCalendar(.ics) 생성 — 다운로드(클라이언트)와 구독 피드(서버)가 공유하는 순수 함수.
// 저장은 UTC(timestamptz) 이므로 DTSTART/DTEND 는 UTC 타임스탬프("...Z")로 기록하고,
// 캘린더 앱이 각자의 로컬(KST 등) 시간으로 변환해 표시한다.

export type ICSEvent = {
  uid: string; // 이벤트 고유 식별자(보통 schedule id)
  startsAt: string; // ISO(UTC)
  endsAt: string; // ISO(UTC)
};

/** ISO(UTC) → iCal UTC 타임스탬프 "YYYYMMDDTHHMMSSZ" */
export function toICSStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** iCal 텍스트 값 이스케이프(RFC 5545) */
export function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/**
 * 확정 수업 목록을 iCalendar 문자열로 생성.
 * @param events UID·시작·종료가 있는 이벤트 목록
 * @param title  각 이벤트 제목이자 구독 캘린더 이름(예: "김규빈 과외")
 */
export function buildICS(events: ICSEvent[], title: string): string {
  const stamp = toICSStamp(new Date().toISOString());
  const summary = icsEscape(title);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TutorHub//Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${summary}`,
    "X-WR-TIMEZONE:Asia/Seoul",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@tutorhub`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toICSStamp(e.startsAt)}`,
      `DTEND:${toICSStamp(e.endsAt)}`,
      `SUMMARY:${summary}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
