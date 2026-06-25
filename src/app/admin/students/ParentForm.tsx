"use client";

import { useActionState } from "react";
import { createParentAction, type ParentFormState } from "./actions";

const initial: ParentFormState = {};

const input =
  "w-full rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent";

export function ParentForm() {
  const [state, action, pending] = useActionState(createParentAction, initial);

  return (
    <form
      action={action}
      className="grid gap-3 rounded-lg border border-black/10 p-4 sm:grid-cols-2 dark:border-white/15"
    >
      <label className="space-y-1 text-sm">
        <span className="font-medium">학부모 로그인 아이디</span>
        <input name="parent_id" required placeholder="예: minjun_mom" className={input} />
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">표시 이름 (선택)</span>
        <input name="display_name" placeholder="예: 김민준 학부모" className={input} />
      </label>

      <label className="space-y-1 text-sm">
        <span className="font-medium">초기 비밀번호 (6자 이상)</span>
        <input name="password" required minLength={6} className={input} />
      </label>

      <div className="sm:col-span-2">
        {state.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}
        {state.ok && (
          <p className="mb-2 text-sm text-green-600">
            학부모 계정이 발급되었습니다. 아이디/비밀번호를 전달하고, 아래
            <span className="font-medium"> 학생 관리</span>에서 자녀를 추가하세요.
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
        >
          {pending ? "생성 중…" : "학부모 추가"}
        </button>
      </div>
    </form>
  );
}
