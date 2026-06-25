"use client";

import { useActionState, useState } from "react";
import { createScheduleAction, type CreateScheduleState } from "./actions";
import { DURATION_OPTIONS, durationLabel } from "@/lib/schedule";
import { kstDateKey, kstTime } from "@/lib/datetime";
import { hhmmToMinutes } from "@/lib/recurrence";
import type { CalendarEvent } from "@/components/MonthCalendar";

const initial: CreateScheduleState = {};

const input =
  "w-full rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent";

export type ScheduleTemplate = {
  id: string;
  studentId: string;
  weekday: number;
  startMinute: number;
  duration: number;
  label: string; // "윤지호 · 월 16:00 (2시간)"
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 표시 중인 달(year/month)에서 템플릿 요일에 해당하는 가장 빠른 날짜를 골라
 * datetime-local 값(KST)으로 반환한다.
 * 우선순위: (오늘 이후 && 같은 학생·같은 시각으로 아직 미등록) → 미등록 → 첫 후보.
 * → 같은 템플릿을 다시 적용하면 이미 등록된 날을 건너뛰고 그 다음 해당 요일로 채워진다.
 */
function pickDateInMonth(
  year: number,
  month: number,
  weekday: number,
  startMinute: number,
  studentId: string,
  events: CalendarEvent[],
): string {
  // 같은 학생·같은 시작시각으로 이미 확정된 날짜(KST) 집합
  const taken = new Set<string>();
  for (const e of events) {
    if (e.studentId !== studentId || e.pending || e.status !== "confirmed")
      continue;
    if (hhmmToMinutes(kstTime(e.startsAt)) === startMinute)
      taken.add(kstDateKey(e.startsAt));
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const candidates: string[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(Date.UTC(year, month - 1, d)).getUTCDay() === weekday)
      candidates.push(`${year}-${pad(month)}-${pad(d)}`);
  }

  const todayKey = kstDateKey(new Date().toISOString());
  const chosen =
    candidates.find((k) => k >= todayKey && !taken.has(k)) ??
    candidates.find((k) => !taken.has(k)) ??
    candidates[0];

  return `${chosen}T${pad(Math.floor(startMinute / 60))}:${pad(startMinute % 60)}`;
}

export function ScheduleForm({
  students,
  templates = [],
  events = [],
  year,
  month,
}: {
  students: { id: string; name: string }[];
  templates?: ScheduleTemplate[];
  events?: CalendarEvent[];
  // 표시 중인 달력 월 — 템플릿 적용 시 이 월에서 날짜를 고른다.
  year: number;
  month: number;
}) {
  const [state, action, pending] = useActionState(createScheduleAction, initial);

  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [duration, setDuration] = useState(60);

  if (students.length === 0) {
    return (
      <p className="rounded-md border border-black/10 p-3 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
        먼저 <span className="font-medium">학생/계정</span> 탭에서 학생을 등록하세요.
      </p>
    );
  }

  function applyTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setStudentId(t.studentId);
    setStartsAt(
      pickDateInMonth(year, month, t.weekday, t.startMinute, t.studentId, events),
    );
    setDuration(t.duration);
  }

  return (
    <form
      action={action}
      className="grid gap-3 rounded-lg border border-black/10 p-4 sm:grid-cols-2 dark:border-white/15"
    >
      {templates.length > 0 ? (
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="font-medium">템플릿 적용</span>
          <select
            value=""
            onChange={(e) => applyTemplate(e.target.value)}
            className={input}
          >
            <option value="">템플릿 선택…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="text-xs text-black/55 dark:text-white/55">
            아래 달력에 보이는 <b>{month}월</b> 중 가장 빠른 해당 요일로 채워지며,
            이미 등록된 날은 건너뜁니다. (학생·수업 시간도 자동 입력)
          </span>
        </label>
      ) : (
        <p className="rounded-md border border-dashed border-black/15 p-2 text-xs text-black/55 sm:col-span-2 dark:border-white/20 dark:text-white/55">
          💡 <b>설정</b> 탭에서 학생별 반복 일정 템플릿을 만들면, 여기에 <b>템플릿
          적용</b> 메뉴가 생겨 한 번에 채울 수 있어요.
        </p>
      )}

      <label className="space-y-1 text-sm">
        <span className="font-medium">학생</span>
        <select
          name="student_id"
          required
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className={input}
        >
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">수업 구분</span>
        <select name="category" defaultValue="regular" className={input}>
          <option value="regular">정규</option>
          <option value="added">추가</option>
        </select>
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">시작 시간</span>
        <input
          type="datetime-local"
          name="starts_at"
          step={1800}
          required
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
          className={input}
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">수업 시간</span>
        <select
          name="duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className={input}
        >
          {DURATION_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {durationLabel(m)}
            </option>
          ))}
        </select>
      </label>

      <label className="space-y-1 text-sm sm:col-span-2">
        <span className="font-medium">메모 (선택)</span>
        <input name="note" placeholder="예: 중간고사 대비" className={input} />
      </label>

      <div className="sm:col-span-2">
        {state.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}
        {state.ok && (
          <p className="mb-2 text-sm text-green-600">일정이 추가되었습니다.</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {pending ? "추가 중…" : "수업 추가"}
        </button>
      </div>
    </form>
  );
}
