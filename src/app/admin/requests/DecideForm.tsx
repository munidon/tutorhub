"use client";

import { useActionState } from "react";
import { decideRequestAction, type DecideActionState } from "./actions";

const initial: DecideActionState = {};

export function DecideForm({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(decideRequestAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="request_id" value={requestId} />
      <input
        name="reason"
        placeholder="반려 사유 (반려 시)"
        className="min-w-40 flex-1 rounded-md border border-black/15 px-2 py-1 text-sm dark:border-white/20 dark:bg-transparent"
      />
      <button
        type="submit"
        name="decision"
        value="approved"
        disabled={pending}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        승인
      </button>
      <button
        type="submit"
        name="decision"
        value="rejected"
        disabled={pending}
        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
      >
        반려
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
