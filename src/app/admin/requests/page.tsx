import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatKST } from "@/lib/datetime";
import type { ChangeRequest, RequestStatus, RequestType } from "@/lib/types";
import { currentKstYearMonth } from "@/lib/schedule";
import { requestDetail } from "@/lib/requests";
import { DecideForm } from "./DecideForm";

type RequestWithStudent = ChangeRequest & {
  students: { name: string } | null;
  schedules: {
    starts_at: string;
    ends_at: string;
    prev_starts: string | null;
    prev_ends: string | null;
  } | null;
};

const TYPE_LABEL: Record<RequestType, string> = {
  add: "추가",
  change: "변경",
  cancel: "취소",
};

// 처리 완료 상태 표기 (withdrawn = 학부모 철회)
const DECIDED_LABEL: Partial<Record<RequestStatus, { label: string; cls: string }>> = {
  approved: { label: "승인됨", cls: "text-green-700" },
  rejected: { label: "반려됨", cls: "text-red-700" },
  withdrawn: { label: "철회됨", cls: "text-black/50 dark:text-white/50" },
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymStr = (y: number, m: number) => `${y}-${pad(m)}`;
// KST 기준 해당 월 1일 00:00 을 UTC ISO 로 (KST = UTC+9 고정)
const kstMonthStartISO = (y: number, m: number) =>
  new Date(`${y}-${pad(m)}-01T00:00:00+09:00`).toISOString();

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const supabase = await createClient();

  const [curY, curM] = currentKstYearMonth();

  // 선택 월 (?ym=YYYY-MM), 기본은 이번달
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

  const select =
    "*, students(name), schedules(starts_at, ends_at, prev_starts, prev_ends)";

  // 대기 중: 월과 무관하게 전부 (놓치면 안 되는 actionable 항목)
  // 처리 완료: 선택한 월에 생성된 것만 (KST 월 경계)
  const startISO = kstMonthStartISO(year, month);
  const endISO = kstMonthStartISO(nextY, nextM);

  const [{ data: pendingRows }, { data: decidedRows }] = await Promise.all([
    supabase
      .from("requests")
      .select(select)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("requests")
      .select(select)
      .neq("status", "pending")
      .gte("created_at", startISO)
      .lt("created_at", endISO)
      .order("created_at", { ascending: false }),
  ]);

  const pending = (pendingRows ?? []) as RequestWithStudent[];
  const decided = (decidedRows ?? []) as RequestWithStudent[];

  const navBtn =
    "rounded-md border border-black/15 px-2 py-1 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">요청 관리</h1>
        <div className="ml-auto flex items-center gap-1">
          <Link
            href={`/admin/requests?ym=${ymStr(prevY, prevM)}`}
            className={navBtn}
            aria-label="이전 달"
          >
            ‹
          </Link>
          <span className="min-w-24 text-center text-sm font-medium">
            {year}년 {month}월
          </span>
          <Link
            href={`/admin/requests?ym=${ymStr(nextY, nextM)}`}
            className={navBtn}
            aria-label="다음 달"
          >
            ›
          </Link>
          {!isCurrent && (
            <Link href="/admin/requests" className={navBtn}>
              이번달
            </Link>
          )}
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-lg font-semibold">대기 중 ({pending.length})</h2>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-black/60 dark:text-white/60">
            처리할 요청이 없습니다.
          </p>
        ) : (
          pending.map((r) => (
            <div
              key={r.id}
              className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {TYPE_LABEL[r.type]}
                </span>
                <span className="font-medium">{r.students?.name ?? "?"}</span>
                <span className="ml-auto text-xs text-black/50 dark:text-white/50">
                  {formatKST(r.created_at)} 요청
                </span>
              </div>

              <div className="text-sm">
                <div className="font-medium">{requestDetail(r, r.schedules)}</div>
                {r.note && (
                  <div className="text-black/60 dark:text-white/60">
                    메시지: {r.note}
                  </div>
                )}
              </div>

              <DecideForm requestId={r.id} />
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          처리 완료 ({year}년 {month}월)
        </h2>
        <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/15">
          {decided.length === 0 && (
            <li className="p-3 text-sm text-black/60 dark:text-white/60">
              {year}년 {month}월 처리 내역이 없습니다.
            </li>
          )}
          {decided.map((r) => {
            const d = DECIDED_LABEL[r.status];
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                <span className="rounded bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
                  {TYPE_LABEL[r.type]}
                </span>
                <span className="font-medium">{r.students?.name ?? "?"}</span>
                <span className={d?.cls}>{d?.label ?? r.status}</span>
                <span className="text-black/70 dark:text-white/70">
                  {requestDetail(r, r.schedules)}
                </span>
                {r.reject_reason && (
                  <span className="text-black/50 dark:text-white/50">
                    · 사유: {r.reject_reason}
                  </span>
                )}
                {r.decided_at && (
                  <span className="ml-auto text-xs text-black/45 dark:text-white/45">
                    {formatKST(r.decided_at)} 처리
                  </span>
                )}
                {r.note && (
                  <span className="w-full text-black/55 dark:text-white/55">
                    메시지: {r.note}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
