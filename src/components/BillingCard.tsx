import type { ReactNode } from "react";
import type { StudentBilling } from "@/lib/schedule";

const fmtHours = (n: number) =>
  `${Number.isInteger(n) ? n : n.toFixed(1)}시간`;

const fmtSignedHours = (n: number) => {
  const v = Number.isInteger(n) ? String(Math.abs(n)) : Math.abs(n).toFixed(1);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${v}시간`;
};

const fmtWon = (n: number | null) =>
  n == null ? "—" : `${n.toLocaleString("ko-KR")}원`;

const fmtSignedWon = (n: number) => {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toLocaleString("ko-KR")}원`;
};

function Box({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-md border border-black/10 p-3 dark:border-white/15">
      <div className="text-xs text-black/55 dark:text-white/55">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      {sub && (
        <div className="mt-0.5 text-xs text-black/55 dark:text-white/55">{sub}</div>
      )}
    </div>
  );
}

export function BillingCard({
  name,
  billing,
  footer,
}: {
  name: string;
  billing: StudentBilling;
  /** 카드 하단 슬롯 — 선생님: 입금 확인 토글 / 학부모: 계좌·복사 안내 */
  footer?: ReactNode;
}) {
  const b = billing;
  const bd = b.breakdown;

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{name}</span>
        <span className="text-xs text-black/55 dark:text-white/55">
          시급 {b.rate == null ? "미설정" : fmtWon(b.rate)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Box label="정규 수업시간" value={fmtHours(b.regularHours)} />
        <Box
          label="변경 수업시간"
          value={fmtSignedHours(bd.changeHours)}
          sub={`추가 +${fmtHours(bd.addedHours)} · 변경 ${fmtSignedHours(
            bd.changedDelta,
          )} · 취소 −${fmtHours(bd.cancelledHours)}`}
        />
        <Box
          label="정규 수업료"
          value={fmtWon(b.regularFee)}
          sub={
            b.prevCarry != null ? `전월 이월 ${fmtSignedWon(b.prevCarry)}` : undefined
          }
        />
        <Box
          label="이월 수업료"
          value={fmtWon(b.carry)}
          sub="다음 달 정규 수업료에 반영"
        />
      </div>

      {b.allChangesSettled && (
        <p className="text-sm text-black/55 dark:text-white/55">
          이번달 변경 수업료는 모두 정산 완료되었습니다.
        </p>
      )}

      {b.rate == null && (
        <p className="text-xs text-amber-600">
          시급이 설정되지 않아 수업료가 계산되지 않았습니다.
        </p>
      )}

      {footer && (
        <div className="border-t border-black/10 pt-3 dark:border-white/10">
          {footer}
        </div>
      )}
    </div>
  );
}
