import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatKST } from "@/lib/datetime";
import type { ChangeRequest, RequestStatus, RequestType } from "@/lib/types";
import { currentKstYearMonth } from "@/lib/schedule";
import { requestDetail } from "@/lib/requests";
import { DeleteRequestButton } from "./DeleteRequestButton";

// 요청 + 가리키는 일정(변경 전후/취소 대상 시각 표시용)
type RequestRow = ChangeRequest & {
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

const STATUS_BADGE: Record<RequestStatus, { label: string; cls: string }> = {
  pending: { label: "대기 중", cls: "bg-amber-100 text-amber-800" },
  approved: { label: "승인됨", cls: "bg-green-100 text-green-800" },
  rejected: { label: "반려됨", cls: "bg-red-100 text-red-800" },
  withdrawn: {
    label: "철회됨",
    cls: "bg-black/10 text-black/60 dark:bg-white/15 dark:text-white/60",
  },
};

// 처리(종료) 시각 앞에 붙는 단어
const DECIDED_WORD: Partial<Record<RequestStatus, string>> = {
  approved: "승인",
  rejected: "반려",
  withdrawn: "철회",
};

const pad = (n: number) => String(n).padStart(2, "0");
const ymStr = (y: number, m: number) => `${y}-${pad(m)}`;
// KST 기준 해당 월 1일 00:00 을 UTC ISO 로 (KST = UTC+9 고정)
const kstMonthStartISO = (y: number, m: number) =>
  new Date(`${y}-${pad(m)}-01T00:00:00+09:00`).toISOString();

export default async function ParentRequestsPage({
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

  // 선택 월에 생성된 요청만 (KST 월 경계)
  const startISO = kstMonthStartISO(year, month);
  const endISO = kstMonthStartISO(nextY, nextM);

  const { data } = await supabase
    .from("requests")
    .select(
      "*, schedules(starts_at, ends_at, prev_starts, prev_ends)",
    )
    .gte("created_at", startISO)
    .lt("created_at", endISO)
    .order("created_at", { ascending: false });

  const requests = (data ?? []) as RequestRow[];

  const navBtn =
    "rounded-md border border-black/15 px-2 py-1 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-bold">내 요청 내역</h1>
        <div className="ml-auto flex items-center gap-1">
          <Link
            href={`/requests?ym=${ymStr(prevY, prevM)}`}
            className={navBtn}
            aria-label="이전 달"
          >
            ‹
          </Link>
          <span className="min-w-24 text-center text-sm font-medium">
            {year}년 {month}월
          </span>
          <Link
            href={`/requests?ym=${ymStr(nextY, nextM)}`}
            className={navBtn}
            aria-label="다음 달"
          >
            ›
          </Link>
          {!isCurrent && (
            <Link href="/requests" className={navBtn}>
              이번달
            </Link>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {requests.length === 0 && (
          <li className="rounded-lg border border-black/10 p-3 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
            {year}년 {month}월에 보낸 요청이 없습니다.
          </li>
        )}
        {requests.map((r) => {
          const badge = STATUS_BADGE[r.status];
          return (
            <li
              key={r.id}
              className="space-y-1 rounded-lg border border-black/10 p-3 dark:border-white/15"
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
                  {TYPE_LABEL[r.type]}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`}
                >
                  {badge.label}
                </span>
                <span className="ml-auto text-xs text-black/50 dark:text-white/50">
                  {formatKST(r.created_at)}
                </span>
                {/* 대기 중인 요청만 취소 가능 (승인/반려된 요청은 버튼 숨김) */}
                {r.status === "pending" && <DeleteRequestButton id={r.id} />}
              </div>
              <div className="text-sm font-medium">
                {requestDetail(r, r.schedules)}
              </div>
              {r.note && (
                <div className="text-sm text-black/55 dark:text-white/55">
                  메시지: {r.note}
                </div>
              )}
              {r.status === "rejected" && r.reject_reason && (
                <div className="text-sm text-red-700">
                  반려 사유: {r.reject_reason}
                </div>
              )}
              {r.decided_at && (
                <div className="text-xs text-black/50 dark:text-white/50">
                  {DECIDED_WORD[r.status] ?? "처리"} · {formatKST(r.decided_at)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
