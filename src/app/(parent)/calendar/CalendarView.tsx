"use client";

import { useMemo, useState } from "react";
import {
  MonthCalendar,
  type CalendarEvent,
  type ActionState,
} from "@/components/MonthCalendar";

type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const input =
  "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

export function CalendarView({
  events,
  childStudents,
  changeAction,
  cancelAction,
  year,
  month,
  onMonthChange,
}: {
  events: CalendarEvent[];
  childStudents: { id: string; name: string }[];
  changeAction: FormAction;
  cancelAction: FormAction;
  year: number;
  month: number;
  onMonthChange: (year: number, month: number) => void;
}) {
  const [selected, setSelected] = useState<string>(childStudents[0]?.id ?? "");

  const current = childStudents.find((c) => c.id === selected);
  const filtered = useMemo(
    () => events.filter((e) => e.studentId === selected),
    [events, selected],
  );

  if (childStudents.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">자녀 일정</h1>
        <p className="rounded-lg border border-black/10 p-3 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          등록된 자녀가 없습니다. 선생님에게 문의하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">
          {current?.name ?? "자녀"} 학생 일정
        </h1>
        {childStudents.length > 1 && (
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className={`${input} ml-auto`}
          >
            {childStudents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="text-sm text-black/60 dark:text-white/60">
        수업을 누르면 시간 변경·취소를 <span className="font-medium">요청</span>할 수 있어요.<br />(선생님 승인 후 반영)
      </p>

      <MonthCalendar
        events={filtered}
        showName={false}
        requestMode
        year={year}
        month={month}
        onMonthChange={onMonthChange}
        changeAction={changeAction}
        cancelAction={cancelAction}
        changeLabel="변경 요청 보내기"
        cancelLabel="취소 요청 보내기"
      />
    </div>
  );
}
