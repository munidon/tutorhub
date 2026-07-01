"use client";

import { useMemo, useState } from "react";
import {
  MonthCalendar,
  type CalendarEvent,
  type ActionState,
} from "@/components/MonthCalendar";
import { currentKstYearMonth } from "@/lib/schedule";
import { kstDateKey, kstTime, kstWeekday } from "@/lib/datetime";
import { buildICS, type ICSEvent } from "@/lib/ics";
import { ScheduleForm, type ScheduleTemplate } from "./ScheduleForm";

type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type SubscribeAction = (
  studentId: string,
) => Promise<{ token?: string; error?: string }>;

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

/** 다운로드용: 해당 학생의 확정 수업(취소·요청 오버레이 제외)을 ICSEvent 목록으로 */
function toICSEvents(events: CalendarEvent[]): ICSEvent[] {
  return events
    .filter((e) => !e.pending && e.status === "confirmed" && e.endsAt)
    .map((e) => ({
      uid: e.scheduleId ?? e.id,
      startsAt: e.startsAt,
      endsAt: e.endsAt!,
    }));
}

export function CalendarView({
  events,
  students,
  templates,
  changeAction,
  cancelAction,
  deleteAction,
  settleAction,
  subscribeAction,
}: {
  events: CalendarEvent[];
  students: { id: string; name: string }[];
  templates: ScheduleTemplate[];
  changeAction: FormAction;
  cancelAction: FormAction;
  deleteAction: FormAction;
  settleAction: FormAction;
  subscribeAction: SubscribeAction;
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
              <SubscribeButton
                key={filter}
                studentId={filter}
                subscribeAction={subscribeAction}
              />
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
    const icsEvents = toICSEvents(events);
    if (icsEvents.length === 0) {
      window.alert("내보낼 일정이 없습니다.");
      return;
    }
    const ics = buildICS(icsEvents, `${studentName} 과외`);
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

/**
 * 해당 학생의 구독(webcal) URL 발급 — 항상 최신 상태로 자동 동기화되는 방식.
 * 클릭 시 비밀 토큰을 발급받아 webcal:// URL 을 만들고 클립보드에 복사한다.
 */
function SubscribeButton({
  studentId,
  subscribeAction,
}: {
  studentId: string;
  subscribeAction: SubscribeAction;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await subscribeAction(studentId);
    setLoading(false);
    if (res.error || !res.token) {
      setError(res.error ?? "구독 URL 발급에 실패했습니다.");
      return;
    }
    // webcal:// 스킴이면 맥·아이폰에서 클릭 시 캘린더 구독 화면이 바로 열린다.
    const base = window.location.origin.replace(/^https?:/, "webcal:");
    const full = `${base}/api/calendar/${res.token}`;
    setUrl(full);
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사 실패해도 URL 은 아래에 노출되므로 무시
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={generate}
        disabled={loading}
        className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        {loading ? "발급 중…" : copied ? "URL 복사됨 ✓" : "구독 URL"}
      </button>

      {error && <p className="basis-full text-sm text-red-600">{error}</p>}

      {url && (
        <div className="basis-full space-y-1 rounded-md border border-black/10 p-3 text-sm dark:border-white/15">
          <p className="text-black/60 dark:text-white/60">
            맥 캘린더 앱에 구독하면 이후 일정이 바뀌어도 자동으로 동기화됩니다.{" "}
            <a href={url} className="font-medium underline">
              구독하기
            </a>{" "}
            를 누르거나, 아래 URL 을 <b>캘린더 › 파일 › 새로운 캘린더 구독</b> 에
            붙여넣으세요.
          </p>
          <code className="block break-all rounded bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
            {url}
          </code>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            ⚠️ 이 주소를 아는 사람은 누구나 이 학생의 일정을 볼 수 있으니 공유에
            주의하세요.
          </p>
        </div>
      )}
    </>
  );
}
