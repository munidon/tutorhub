import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Student } from "@/lib/types";
import {
  computeBilling,
  currentKstYearMonth,
  type BillingSchedule,
} from "@/lib/schedule";
import { kstMonthStartISO, ymKey as ymStr } from "@/lib/month";
import { BillingCard } from "@/components/BillingCard";
import { PaymentToggle } from "./PaymentToggle";

// 정산 계산(computeBilling)에 필요한 컬럼만 조회
const BILLING_COLS =
  "student_id, starts_at, ends_at, status, category, base_category, prev_starts, prev_ends, settled";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const supabase = await createClient();

  const [curY, curM] = currentKstYearMonth();

  // 선택 월 (?ym=YYYY-MM), 기본은 이번달 — 쿼리 배치 전에 먼저 확정
  const { ym } = await searchParams;
  let year = curY;
  let month = curM;
  if (ym && /^\d{4}-\d{2}$/.test(ym)) {
    const [y, m] = ym.split("-").map(Number);
    if (m >= 1 && m <= 12) {
      year = y;
      month = m;
    }
  }
  const isCurrent = year === curY && month === curM;

  const [prevY, prevM] = month === 1 ? [year - 1, 12] : [year, month - 1];
  const [nextY, nextM] = month === 12 ? [year + 1, 1] : [year, month + 1];
  const monthYm = ymStr(year, month);

  // 서로 독립적인 조회 — 병렬 실행 (입금 확인은 선택 월 기준)
  // 정산은 선택 월 + 전월(이월 계산)만 필요하므로 그 범위만 조회
  const [{ data: studentRows }, { data: scheduleRows }, { data: paymentRows }] =
    await Promise.all([
      supabase.from("students").select("*").eq("active", true).order("name"),
      supabase
        .from("schedules")
        .select(BILLING_COLS)
        .gte("starts_at", kstMonthStartISO(prevY, prevM))
        .lt("starts_at", kstMonthStartISO(nextY, nextM)),
      supabase.from("payments").select("student_id").eq("ym", monthYm),
    ]);
  const students = (studentRows ?? []) as Student[];
  const schedules = (scheduleRows ?? []) as unknown as BillingSchedule[];
  const paidSet = new Set((paymentRows ?? []).map((p) => p.student_id as string));

  const billings = students.map((st) => ({
    student: st,
    billing: computeBilling(
      schedules.filter((s) => s.student_id === st.id),
      st.hourly_rate,
      year,
      month,
    ),
  }));

  const totalRegularFee = billings.reduce(
    (sum, b) => sum + (b.billing.regularFee ?? 0),
    0,
  );
  const anyRate = billings.some((b) => b.billing.rate != null);

  const navBtn =
    "rounded-md border border-black/15 px-2 py-1 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">수업료 정산</h1>
        <div className="ml-auto flex items-center gap-1">
          <Link href={`/admin?ym=${ymStr(prevY, prevM)}`} className={navBtn} aria-label="이전 달">
            ‹
          </Link>
          <span className="min-w-24 text-center text-sm font-medium">
            {year}년 {month}월
          </span>
          <Link href={`/admin?ym=${ymStr(nextY, nextM)}`} className={navBtn} aria-label="다음 달">
            ›
          </Link>
          {!isCurrent && (
            <Link href="/admin" className={navBtn}>
              이번달
            </Link>
          )}
        </div>
      </div>

      {students.length === 0 ? (
        <p className="rounded-lg border border-black/10 p-4 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
          활성 학생이 없습니다. 학생/계정 탭에서 등록하세요.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-black/10 bg-black/[0.02] p-4 dark:border-white/15 dark:bg-white/[0.03]">
            <div className="text-sm text-black/55 dark:text-white/55">
              정규 수업료 합계 ({students.length}명)
            </div>
            <div className="mt-1 text-2xl font-bold">
              {anyRate ? `${totalRegularFee.toLocaleString("ko-KR")}원` : "—"}
            </div>
          </div>

          <div className="space-y-3">
            {billings.map(({ student, billing }) => (
              <BillingCard
                key={student.id}
                name={student.name}
                billing={billing}
                footer={
                  <PaymentToggle
                    studentId={student.id}
                    ym={monthYm}
                    paid={paidSet.has(student.id)}
                  />
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
