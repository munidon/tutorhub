"use client";

import { useMemo, useState } from "react";
import {
  MonthCalendar,
  type CalendarEvent,
  type ActionState,
} from "@/components/MonthCalendar";
import { currentKstYearMonth } from "@/lib/schedule";
import { ScheduleForm, type ScheduleTemplate } from "./ScheduleForm";

type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const input =
  "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

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
