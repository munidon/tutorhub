"use client";

import { useActionState } from "react";
import { setPaymentAction, type PaymentActionState } from "./actions";

const initial: PaymentActionState = {};

/** 선생님 정산 카드 하단: 입금 확인 토글 */
export function PaymentToggle({
  studentId,
  ym,
  paid,
}: {
  studentId: string;
  ym: string;
  paid: boolean;
}) {
  const [state, action, pending] = useActionState(setPaymentAction, initial);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="ym" value={ym} />
      {/* 현재 상태의 반대값을 보냄 */}
      <input type="hidden" name="paid" value={paid ? "0" : "1"} />
      {paid ? (
        <>
          <span className="text-sm font-medium text-green-700">
            정규 수업료 입금 확인되었습니다!
          </span>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            {pending ? "처리 중…" : "확인 취소"}
          </button>
        </>
      ) : (
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "처리 중…" : "입금 확인"}
        </button>
      )}
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
