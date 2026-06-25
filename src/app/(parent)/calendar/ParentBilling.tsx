"use client";

import type { Student, Schedule, BankInfo } from "@/lib/types";
import { computeBilling } from "@/lib/schedule";
import { BillingCard } from "@/components/BillingCard";
import { CopyAccountButton } from "@/components/CopyAccountButton";

const pad = (n: number) => String(n).padStart(2, "0");

/** 표시 월(year/month)에 맞춰 청구서를 다시 계산해 보여준다 (계좌·입금 확인 포함). */
export function ParentBilling({
  year,
  month,
  students,
  schedules,
  payments,
  bank,
}: {
  year: number;
  month: number;
  students: Student[];
  schedules: Schedule[];
  payments: { student_id: string; ym: string }[];
  bank: BankInfo | null;
}) {
  const ym = `${year}-${pad(month)}`;
  const paidSet = new Set(
    payments.filter((p) => p.ym === ym).map((p) => p.student_id),
  );
  const hasBank = !!(bank && (bank.account_number || bank.bank_name));

  const billings = students.map((st) => ({
    student: st,
    billing: computeBilling(
      schedules.filter((s) => s.student_id === st.id),
      st.hourly_rate,
      year,
      month,
    ),
  }));

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">수업료 안내 ({month}월)</h2>
      {billings.length === 0 ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          등록된 자녀가 없습니다.
        </p>
      ) : (
        <div className="space-y-3">
          {billings.map(({ student, billing }) => (
            <BillingCard
              key={student.id}
              name={student.name}
              billing={billing}
              footer={
                paidSet.has(student.id) ? (
                  <p className="text-sm font-medium text-green-700">
                    정규 수업료 입금 확인되었습니다!
                  </p>
                ) : hasBank ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="text-black/55 dark:text-white/55">입금 안내</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {[bank?.bank_name, bank?.account_number]
                          .filter(Boolean)
                          .join(" ")}
                        {bank?.account_holder ? ` (${bank.account_holder})` : ""}
                      </span>
                      {bank?.account_number && (
                        <CopyAccountButton account={bank.account_number} />
                      )}
                    </div>
                  </div>
                ) : null
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
