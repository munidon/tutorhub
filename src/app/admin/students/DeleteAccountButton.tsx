"use client";

import { useState } from "react";
import { deleteParentAction } from "./actions";

export function DeleteAccountButton({
  parentId,
  loginId,
}: {
  parentId: string;
  loginId: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-500/40 dark:hover:bg-red-950/30"
      >
        계정 삭제
      </button>
    );
  }

  return (
    <form action={deleteParentAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="parent_id" value={parentId} />
      <span className="text-xs text-red-600">
        &lsquo;{loginId}&rsquo; 계정과 연결된 자녀·수업 기록이 모두 영구 삭제됩니다.
      </span>
      <button
        type="submit"
        className="rounded-md bg-red-600 px-2 py-1 text-xs font-medium text-white"
      >
        삭제 확인
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        취소
      </button>
    </form>
  );
}
