"use client";

import { useActionState, useState } from "react";
import { withdrawRequestAction, type RequestActionState } from "../actions";

const initial: RequestActionState = {};

export function DeleteRequestButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(withdrawRequestAction, initial);

  return (
    <div className="flex flex-col items-end gap-1">
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
        >
          요청 취소
        </button>
      ) : (
        <form action={action} className="flex items-center gap-1">
          <input type="hidden" name="request_id" value={id} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {pending ? "처리 중…" : "취소 확인"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            닫기
          </button>
        </form>
      )}
      {state.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </div>
  );
}
