"use client";

import { useActionState, useState } from "react";
import type { Student } from "@/lib/types";
import {
  addStudentAction,
  deactivateStudentAction,
  reactivateStudentAction,
  updateStudentAction,
  type StudentActionState,
} from "./actions";

const btn =
  "rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";
const input =
  "w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";
const initial: StudentActionState = {};

export function StudentManager({
  parentId,
  students,
}: {
  parentId: string;
  students: Student[];
}) {
  const [open, setOpen] = useState(false);
  const active = students.filter((s) => s.active);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-black/70 dark:text-white/70">
          자녀:{" "}
          {active.length > 0 ? (
            active.map((s) => s.name).join(", ")
          ) : (
            <span className="text-black/40 dark:text-white/40">없음</span>
          )}
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} className={`${btn} ml-auto`}>
          {open ? "닫기" : "학생 관리"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-black/10 pt-3 dark:border-white/15">
          {students.length > 0 && (
            <ul className="space-y-1">
              {students.map((s) => (
                <StudentRow key={s.id} student={s} />
              ))}
            </ul>
          )}
          <AddStudentForm parentId={parentId} />
        </div>
      )}
    </div>
  );
}

function StudentRow({ student }: { student: Student }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(updateStudentAction, initial);

  return (
    <li className="space-y-2 rounded-md border border-black/10 p-2 dark:border-white/15">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span
          className="h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: student.color }}
        />
        <span
          className={student.active ? "" : "text-black/40 line-through dark:text-white/40"}
        >
          {student.name}
        </span>
        {!student.active && (
          <span className="text-xs text-black/40 dark:text-white/40">(제거됨)</span>
        )}

        <div className="ml-auto">
          {student.active ? (
            confirming ? (
              <span className="flex items-center gap-2">
                <span className="text-xs text-red-600">
                  제거 시 이 학생의 일정·요청이 캘린더에서 사라집니다.
                </span>
                <form action={deactivateStudentAction}>
                  <input type="hidden" name="student_id" value={student.id} />
                  <button
                    type="submit"
                    className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white"
                  >
                    제거 확인
                  </button>
                </form>
                <button type="button" onClick={() => setConfirming(false)} className={btn}>
                  취소
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-950/30"
              >
                제거
              </button>
            )
          ) : (
            <form action={reactivateStudentAction}>
              <input type="hidden" name="student_id" value={student.id} />
              <button type="submit" className={btn}>
                복구
              </button>
            </form>
          )}
        </div>
      </div>

      <form action={action} className="flex flex-wrap items-end gap-2 text-sm">
        <input type="hidden" name="student_id" value={student.id} />
        <label className="space-y-1">
          <span className="block text-xs font-medium">색상</span>
          <input
            name="color"
            type="color"
            defaultValue={student.color}
            className="h-9 w-12 rounded-md border border-black/15 dark:border-white/20"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium">시급 (원)</span>
          <input
            name="hourly_rate"
            type="number"
            min={0}
            step={1000}
            defaultValue={student.hourly_rate ?? ""}
            placeholder="미설정"
            className="w-28 rounded-md border border-black/15 px-2 py-1.5 dark:border-white/20 dark:bg-transparent"
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className={`${btn} h-9`}
        >
          {pending ? "저장 중…" : "저장"}
        </button>
        {state.error && <span className="text-xs text-red-600">{state.error}</span>}
        {state.ok && <span className="text-xs text-green-600">저장됨</span>}
      </form>
    </li>
  );
}

function AddStudentForm({ parentId }: { parentId: string }) {
  const [state, action, pending] = useActionState(addStudentAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="parent_id" value={parentId} />
      <label className="flex-1 space-y-1 text-sm">
        <span className="font-medium">학생 추가</span>
        <input name="name" required placeholder="학생 이름" className={input} />
      </label>
      <input
        name="color"
        type="color"
        defaultValue="#3b82f6"
        className="h-10 w-12 rounded-md border border-black/15 dark:border-white/20"
        aria-label="캘린더 색상"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "추가 중…" : "추가"}
      </button>
      {state.error && (
        <p className="w-full text-sm text-red-600">{state.error}</p>
      )}
    </form>
  );
}
