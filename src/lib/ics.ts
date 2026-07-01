// iCalendar(.ics) 생성 — 다운로드(클라이언트)와 구독 피드(서버)가 공유하는 순수 함수.
// 저장은 UTC(timestamptz) 이므로 DTSTART/DTEND 는 UTC 타임스탬프("...Z")로 기록하고,
// 캘린더 앱이 각자의 로컬(KST 등) 시간으로 변환해 표시한다.

export type ICSEvent = {
  uid: string; // 이벤트 고유 식별자(보통 schedule id)
  startsAt: string; // ISO(UTC)
  endsAt: string; // ISO(UTC)
  summary?: string; // 이벤트 제목(미지정 시 캘린더 이름을 사용) — 전체 구독의 학생명 구분용
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
 * @param events  UID·시작·종료(·개별 제목)가 있는 이벤트 목록
 * @param calName 구독 캘린더 이름이자, 개별 제목이 없는 이벤트의 기본 제목(예: "김규빈 과외")
 */
export function buildICS(events: ICSEvent[], calName: string): string {
  const stamp = toICSStamp(new Date().toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TutorHub//Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calName)}`,
    "X-WR-TIMEZONE:Asia/Seoul",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@tutorhub`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toICSStamp(e.startsAt)}`,
      `DTEND:${toICSStamp(e.endsAt)}`,
      `SUMMARY:${icsEscape(e.summary ?? calName)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
