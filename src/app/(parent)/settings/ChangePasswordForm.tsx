"use client";

import { useActionState } from "react";
import { changePasswordAction, type PasswordActionState } from "./actions";

const initial: PasswordActionState = {};

const input =
  "w-full rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  return (
    <form
      action={action}
      className="max-w-sm space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15"
    >
      <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
        <b>이 사이트에서만 사용하실 비밀번호</b>를 권장합니다.
        <br />
        분실 시, 선생님께 문의하시면 초기화해 드립니다.
      </p>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">현재 비밀번호</span>
        <input type="password" name="current" required className={input} />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">새 비밀번호</span>
        <input
          type="password"
          name="next"
          required
          minLength={6}
          className={input}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">새 비밀번호 확인</span>
        <input
          type="password"
          name="confirm"
          required
          minLength={6}
          className={input}
        />
      </label>

      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      {state.ok && (
        <p className="text-sm text-green-600">비밀번호가 변경되었습니다.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50"
      >
        {pending ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
