"use client";

import { useMemo, useState } from "react";
import {
  MonthCalendar,
  type CalendarEvent,
  type ActionState,
} from "@/components/MonthCalendar";
import { currentKstYearMonth } from "@/lib/schedule";
import { kstDateKey, kstTime, kstWeekday } from "@/lib/datetime";
import { ScheduleForm, type ScheduleTemplate } from "./ScheduleForm";

type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const input =
  "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 해당 월 확정 수업(취소·요청 제외)을 "6/7(일): 14:00~17:00" 형식 텍스트로 추출 */
function buildScheduleText(
  events: CalendarEvent[],
  year: number,
  month: number,
): string {
  const prefix = `${year}-${pad2(month)}`;
  return events
    .filter(
      (e) =>
        !e.pending &&
        e.status === "confirmed" &&
        kstDateKey(e.startsAt).startsWith(prefix),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((e) => {
      const [, m, d] = kstDateKey(e.startsAt).split("-").map(Number);
      const time = e.endsAt
        ? `${kstTime(e.startsAt)}~${kstTime(e.endsAt)}`
        : kstTime(e.startsAt);
      return `${m}/${d}(${kstWeekday(e.startsAt)}): ${time}`;
    })
    .join("\n");
}

/** ISO(UTC) → iCal UTC 타임스탬프 "YYYYMMDDTHHMMSSZ" */
function toICSStamp(iso: string): string {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** iCal 텍스트 값 이스케이프(RFC 5545) */
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** 해당 학생의 확정 수업(취소·요청 제외) 전체를 iCal(.ics) 문자열로 생성 */
function buildICS(events: CalendarEvent[], studentName: string): string {
  const stamp = toICSStamp(new Date().toISOString());
  const summary = icsEscape(`${studentName} 과외`);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TutorHub//Calendar//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const e of events) {
    if (e.pending || e.status !== "confirmed" || !e.endsAt) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.scheduleId ?? e.id}@tutorhub`,
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

export function CalendarView({
  events,
  students,
  templates,
  changeAction,
  cancelAction,
  deleteAction,
  settleAction,
}: {
  events: CalendarEvent[];
  students: { id: string; name: string }[];
  templates: ScheduleTemplate[];
  changeAction: FormAction;
  cancelAction: FormAction;
  deleteAction: FormAction;
  settleAction: FormAction;
}) {
  const [filter, setFilter] = useState<string>("all");
  // 표시 월 — 수업 추가의 '템플릿 적용'이 이 월을 기준으로 날짜를 계산한다.
  const [[year, month], setYM] = useState<[number, number]>(() =>
    currentKstYearMonth(),
  );

  const filtered = useMemo(
    () =>
      filter === "all"
        ? events
        : events.filter((e) => e.studentId === filter),
    [events, filter],
  );

  const selectedName =
    students.find((s) => s.id === filter)?.name ?? "학생";

  return (
    <div className="space-y-6">
      <details className="rounded-lg border border-black/10 dark:border-white/15">
        <summary className="cursor-pointer p-3 text-sm font-medium">
          + 수업 추가
        </summary>
        <div className="border-t border-black/10 p-3 dark:border-white/15">
          <ScheduleForm
            students={students}
            templates={templates}
            events={events}
            year={year}
            month={month}
          />
        </div>
      </details>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">학생 보기</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={input}
            >
              <option value="all">전체 학생</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          {filter !== "all" && (
            <>
              <ExtractButton events={filtered} year={year} month={month} />
              <ExportICSButton events={filtered} studentName={selectedName} />
            </>
          )}
        </div>

        <MonthCalendar
          events={filtered}
          showName={filter === "all"}
          showEndTime
          year={year}
          month={month}
          onMonthChange={(y, m) => setYM([y, m])}
          changeAction={changeAction}
          cancelAction={cancelAction}
          deleteAction={deleteAction}
          settleAction={settleAction}
          changeLabel="시간 변경 저장"
          cancelLabel="수업 취소"
          deleteLabel="수업 삭제"
        />
      </div>
    </div>
  );
}

/** 표시 중인 월의 해당 학생 일정을 텍스트로 클립보드에 복사 */
function ExtractButton({
  events,
  year,
  month,
}: {
  events: CalendarEvent[];
  year: number;
  month: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = buildScheduleText(events, year, month);
    if (!text) {
      window.alert("이 달에 복사할 일정이 없습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 클립보드 API 미지원/거부 시 폴백
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
    >
      {copied ? "복사됨 ✓" : "일정 추출"}
    </button>
  );
}

/** 해당 학생의 모든 확정 수업을 .ics 파일로 내려받아 캘린더 앱에 가져오기 */
function ExportICSButton({
  events,
  studentName,
}: {
  events: CalendarEvent[];
  studentName: string;
}) {
  function download() {
    const hasLesson = events.some(
      (e) => !e.pending && e.status === "confirmed" && e.endsAt,
    );
    if (!hasLesson) {
      window.alert("내보낼 일정이 없습니다.");
      return;
    }
    const ics = buildICS(events, studentName);
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${studentName}_과외.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
    >
      캘린더 내보내기(.ics)
    </button>
  );
}
