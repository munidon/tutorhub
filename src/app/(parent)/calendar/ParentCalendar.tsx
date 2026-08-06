"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Student, BankInfo } from "@/lib/types";
import type { CalendarEvent, ActionState } from "@/components/MonthCalendar";
import type { BillingSchedule } from "@/lib/schedule";
import { ymKey } from "@/lib/month";
import { CalendarView } from "./CalendarView";
import { AddRequestForm } from "./AddRequestForm";
import { ParentBilling } from "./ParentBilling";

type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

/**
 * 학부모 캘린더 + 청구서를 하나의 표시 월(year/month) 상태로 묶는다.
 * 달력을 넘기면 아래 '수업료 안내'도 같은 월로 다시 계산된다.
 * 조회 창(viewMinYm~viewMaxYm) 밖으로 이동하면 ?ym= 서버 네비게이션으로 재조회.
 */
export function ParentCalendar({
  events,
  students,
  billingSchedules,
  payments,
  bank,
  initialYear,
  initialMonth,
  viewMinYm,
  viewMaxYm,
  changeAction,
  cancelAction,
}: {
  events: CalendarEvent[];
  students: Student[];
  billingSchedules: BillingSchedule[];
  payments: { student_id: string; ym: string }[];
  bank: BankInfo | null;
  initialYear: number;
  initialMonth: number;
  viewMinYm: string;
  viewMaxYm: string;
  changeAction: FormAction;
  cancelAction: FormAction;
}) {
  const router = useRouter();
  const [[year, month], setYM] = useState<[number, number]>([
    initialYear,
    initialMonth,
  ]);
  const childStudents = students.map((s) => ({ id: s.id, name: s.name }));

  function handleMonthChange(y: number, m: number) {
    const key = ymKey(y, m);
    if (key < viewMinYm || key > viewMaxYm) {
      // 로드된 창 밖 → 해당 월 중심으로 서버에서 다시 조회
      router.push(`/calendar?ym=${key}`);
      return;
    }
    setYM([y, m]);
  }

  return (
    <div className="space-y-6">
      <CalendarView
        events={events}
        childStudents={childStudents}
        changeAction={changeAction}
        cancelAction={cancelAction}
        year={year}
        month={month}
        onMonthChange={handleMonthChange}
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
        schedules={billingSchedules}
        payments={payments}
        bank={bank}
      />
    </div>
  );
}
