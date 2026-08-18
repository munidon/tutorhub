import { createClient } from "@/lib/supabase/server";
import type { Student, ChangeRequest, BankInfo } from "@/lib/types";
import { requestChangeAction, requestCancelAction } from "../actions";
import type { CalendarEvent } from "@/components/MonthCalendar";
import {
  scheduleTag,
  movedAcrossMonths,
  CARRIED_OUT_TAG,
  currentKstYearMonth,
  type BillingSchedule,
} from "@/lib/schedule";
import { calendarWindow, parseYm } from "@/lib/month";
import { ParentCalendar } from "./ParentCalendar";

const REQ_LABEL: Record<ChangeRequest["type"], string> = {
  add: "추가요청",
  change: "변경요청",
  cancel: "취소요청",
};

// 화면(달력·정산)에 실제로 쓰는 컬럼만 조회 — RSC 페이로드 축소
const SCHEDULE_COLS =
  "id, student_id, starts_at, ends_at, status, base_category, origin_starts_at, origin_ends_at, settled";
type ScheduleRow = BillingSchedule & { id: string };

// 요청 칩의 기준 시각은 원본 수업을 임베드해 조회 (조회 창과 무관하게 정확)
type RequestWithBase = ChangeRequest & {
  schedules: { starts_at: string; ends_at: string } | null;
};

export default async function ParentCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const supabase = await createClient();

  // 중심 월(?ym=, 기본 이번달) 주변 창만 조회 — 창 안 월 이동은 클라이언트에서 즉시
  const [year, month] =
    parseYm((await searchParams).ym) ?? currentKstYearMonth();
  const win = calendarWindow(year, month);

  // 서로 독립적인 조회 — 병렬 실행 (RLS 로 본인 자녀만 조회됨)
  const [
    { data: studentRows },
    { data: scheduleRows },
    { data: reqRows },
    { data: bankRows },
    { data: paymentRows },
  ] = await Promise.all([
    supabase.from("students").select("*").eq("active", true),
    supabase
      .from("schedules")
      .select(SCHEDULE_COLS)
      // 다른 달로 옮겨진 수업은 계획됐던 달에도 흔적을 남긴다 (선생님 캘린더와 동일)
      .or(
        `and(starts_at.gte."${win.fetchStartISO}",starts_at.lt."${win.fetchEndISO}"),` +
          `and(origin_starts_at.gte."${win.fetchStartISO}",origin_starts_at.lt."${win.fetchEndISO}")`,
      )
      .order("starts_at", { ascending: true }),
    supabase
      .from("requests")
      .select("*, schedules(starts_at, ends_at)")
      .eq("status", "pending"),
    // 계좌 안내(민감정보 제외 RPC) + 창 안 월들의 입금 확인 현황
    supabase.rpc("bank_info"),
    supabase.from("payments").select("student_id, ym").in("ym", win.viewYms),
  ]);
  const students = (studentRows ?? []) as Student[];
  const schedules = (scheduleRows ?? []) as unknown as ScheduleRow[];
  const pendingReqs = (reqRows ?? []) as unknown as RequestWithBase[];
  const bank = ((bankRows ?? [])[0] ?? null) as BankInfo | null;
  const payments = (paymentRows ?? []) as { student_id: string; ym: string }[];

  const studentById = new Map(students.map((s) => [s.id, s]));
  const nameOf = (id: string) => studentById.get(id)?.name ?? "자녀";
  const colorOf = (id: string) => studentById.get(id)?.color ?? "#3b82f6";

  const confirmedEvents: CalendarEvent[] = schedules.flatMap((s) => {
    const base = {
      studentId: s.student_id,
      title: nameOf(s.student_id),
      color: colorOf(s.student_id),
    };
    const chip: CalendarEvent = {
      ...base,
      id: s.id,
      scheduleId: s.id,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      status: s.status,
      tag: scheduleTag(s),
      settled: s.settled,
    };
    // 계획됐던 자리에 '빠져나감' 흔적 — 클릭 불가(scheduleId 없음)
    if (!movedAcrossMonths(s)) return [chip];
    return [
      chip,
      {
        ...base,
        id: `moved-${s.id}`,
        startsAt: s.origin_starts_at,
        endsAt: s.origin_ends_at,
        status: "cancelled" as const,
        tag: CARRIED_OUT_TAG,
      },
    ];
  });

  const pendingEvents: CalendarEvent[] = pendingReqs.map((r) => {
    const base = r.schedules;
    const startsAt =
      r.type === "cancel"
        ? (base?.starts_at ?? r.created_at)
        : (r.proposed_starts ?? base?.starts_at ?? r.created_at);
    const endsAt =
      r.type === "cancel" ? base?.ends_at : (r.proposed_ends ?? base?.ends_at);
    return {
      id: `req-${r.id}`,
      studentId: r.student_id,
      title: nameOf(r.student_id),
      tag: REQ_LABEL[r.type],
      color: colorOf(r.student_id),
      startsAt,
      endsAt: endsAt ?? undefined,
      status: "confirmed" as const,
      pending: true,
      requestType: r.type,
    };
  });

  const events = [...confirmedEvents, ...pendingEvents];

  return (
    <ParentCalendar
      // 중심 월이 바뀌면 리마운트해 표시 월 상태를 새 창에 맞춘다
      key={`${year}-${month}`}
      events={events}
      students={students}
      billingSchedules={schedules}
      payments={payments}
      bank={bank}
      initialYear={year}
      initialMonth={month}
      viewMinYm={win.viewMinYm}
      viewMaxYm={win.viewMaxYm}
      changeAction={requestChangeAction}
      cancelAction={requestCancelAction}
    />
  );
}
