"use client";

import { useActionState, useState } from "react";
import { resetParentPasswordAction, type ParentFormState } from "./actions";

// actions.ts 의 값과 일치시켜야 함 ("use server" 라 상수를 export 할 수 없음)
const RESET_PASSWORD = "123456";
const initial: ParentFormState = {};
const btn =
  "rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

export function ResetPasswordButton({
  parentId,
  loginId,
}: {
  parentId: string;
  loginId: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(
    resetParentPasswordAction,
    initial,
  );

  if (state.ok) {
    return (
      <span className="text-xs text-green-700">
        초기화됨 · 새 비밀번호{" "}
        <span className="font-mono font-semibold">{RESET_PASSWORD}</span>
      </span>
    );
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={btn}>
        비번 초기화
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-1">
      <input type="hidden" name="parent_id" value={parentId} />
      <span className="text-xs text-black/60 dark:text-white/60">
        ‘{loginId}’ 비번을 {RESET_PASSWORD}으로 초기화?
      </span>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-amber-500 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {pending ? "처리 중…" : "초기화"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className={btn}>
        취소
      </button>
      {state.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}
