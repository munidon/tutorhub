"use client";

import { useState } from "react";
import type { Student, Schedule, BankInfo } from "@/lib/types";
import type { CalendarEvent, ActionState } from "@/components/MonthCalendar";
import { currentKstYearMonth } from "@/lib/schedule";
import { CalendarView } from "./CalendarView";
import { AddRequestForm } from "./AddRequestForm";
import { ParentBilling } from "./ParentBilling";

type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * 학부모 캘린더 + 청구서를 하나의 표시 월(year/month) 상태로 묶는다.
 * 달력을 넘기면 아래 '수업료 안내'도 같은 월로 다시 계산된다.
 */
export function ParentCalendar({
  events,
  students,
  schedules,
  payments,
  bank,
  changeAction,
  cancelAction,
}: {
  events: CalendarEvent[];
  students: Student[];
  schedules: Schedule[];
  payments: { student_id: string; ym: string }[];
  bank: BankInfo | null;
  changeAction: FormAction;
  cancelAction: FormAction;
}) {
  const [[year, month], setYM] = useState<[number, number]>(() =>
    currentKstYearMonth(),
  );
  const childStudents = students.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="space-y-6">
      <CalendarView
        events={events}
        childStudents={childStudents}
        changeAction={changeAction}
        cancelAction={cancelAction}
        year={year}
        month={month}
        onMonthChange={(y, m) => setYM([y, m])}
      />

      <details className="rounded-lg border border-black/10 dark:border-white/15">
        <summary className="cursor-pointer p-3 text-sm font-medium">
          + 추가 수업 요청
        </summary>
        <div className="border-t border-black/10 p-3 dark:border-white/15">
          <AddRequestForm students={childStudents} />
        </div>
      </details>

      <ParentBilling
        year={year}
        month={month}
        students={students}
        schedules={schedules}
        payments={payments}
        bank={bank}
      />
    </div>
  );
}
