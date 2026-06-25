"use client";

import { useActionState } from "react";
import { createRequestAction, type RequestActionState } from "../actions";
import { DurationSelect } from "@/components/DurationSelect";

const initial: RequestActionState = {};

const input =
  "w-full rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent";

export function AddRequestForm({
  students,
}: {
  students: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createRequestAction, initial);

  return (
    <form
      action={action}
      className="grid gap-3 rounded-lg border border-black/10 p-4 sm:grid-cols-2 dark:border-white/15"
    >
      <input type="hidden" name="type" value="add" />

      <label className="space-y-1 text-sm">
        <span className="font-medium">학생</span>
        <select name="student_id" required className={input}>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="hidden sm:block" />

      <label className="space-y-1 text-sm">
        <span className="font-medium">시작 시간</span>
        <input
          type="datetime-local"
          name="proposed_starts"
          step={1800}
          required
          className={input}
        />
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">수업 시간</span>
        <DurationSelect className={input} />
      </label>

      <label className="space-y-1 text-sm sm:col-span-2">
        <span className="font-medium">요청 메시지</span>
        <textarea
          name="note"
          rows={2}
          placeholder="선생님께 보낼 메세지를 입력해주세요(선택)"
          className={`${input} resize-none`}
        />
      </label>

      <div className="sm:col-span-2">
        {state.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}
        {state.ok && (
          <p className="mb-2 text-sm text-green-600">요청을 보냈습니다.</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {pending ? "보내는 중…" : "추가 요청 보내기"}
        </button>
      </div>
    </form>
  );
}
