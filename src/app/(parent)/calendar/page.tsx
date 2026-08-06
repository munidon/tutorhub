import { createClient } from "@/lib/supabase/server";
import type { Schedule, Student, ChangeRequest, BankInfo } from "@/lib/types";
import { requestChangeAction, requestCancelAction } from "../actions";
import type { CalendarEvent } from "@/components/MonthCalendar";
import { categoryTag } from "@/lib/schedule";
import { ParentCalendar } from "./ParentCalendar";

const REQ_LABEL: Record<ChangeRequest["type"], string> = {
  add: "추가요청",
  change: "변경요청",
  cancel: "취소요청",
};

export default async function ParentCalendarPage() {
  const supabase = await createClient();

  // 서로 독립적인 조회 — 병렬 실행 (RLS 로 본인 자녀만 조회됨)
  const [
    { data: studentRows },
    { data: scheduleRows },
    { data: reqRows },
    { data: bankRows },
    { data: paymentRows },
  ] = await Promise.all([
    supabase.from("students").select("*").eq("active", true),
    // 달력에는 과거 일정도 표시하므로 전체 조회
    supabase.from("schedules").select("*").order("starts_at", { ascending: true }),
    supabase.from("requests").select("*").eq("status", "pending"),
    // 계좌 안내(민감정보 제외 RPC) + 입금 확인 현황 전체(월별 전환에 대비해 전부)
    supabase.rpc("bank_info"),
    supabase.from("payments").select("student_id, ym"),
  ]);
  const students = (studentRows ?? []) as Student[];
  const schedules = (scheduleRows ?? []) as Schedule[];
  const pendingReqs = (reqRows ?? []) as ChangeRequest[];
  const bank = ((bankRows ?? [])[0] ?? null) as BankInfo | null;
  const payments = (paymentRows ?? []) as { student_id: string; ym: string }[];

  const studentOf = (id: string) => students.find((s) => s.id === id);
  const nameOf = (id: string) => studentOf(id)?.name ?? "자녀";
  const colorOf = (id: string) => studentOf(id)?.color ?? "#3b82f6";

  const scheduleById = new Map(schedules.map((s) => [s.id, s]));

  const confirmedEvents: CalendarEvent[] = schedules.map((s) => ({
    id: s.id,
    scheduleId: s.id,
    studentId: s.student_id,
    title: nameOf(s.student_id),
    color: colorOf(s.student_id),
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    status: s.status,
    tag: categoryTag(s.status, s.category),
    settled: s.settled,
  }));

  const pendingEvents: CalendarEvent[] = pendingReqs.map((r) => {
    const base = r.schedule_id ? scheduleById.get(r.schedule_id) : undefined;
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
      events={events}
      students={students}
      schedules={schedules}
      payments={payments}
      bank={bank}
      changeAction={requestChangeAction}
      cancelAction={requestCancelAction}
    />
  );
}
