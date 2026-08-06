import { createClient } from "@/lib/supabase/server";
import type { Schedule, ChangeRequest, RecurrenceTemplate } from "@/lib/types";
import type { CalendarEvent } from "@/components/MonthCalendar";
import {
  categoryTag,
  currentKstYearMonth,
  durationLabel,
} from "@/lib/schedule";
import { calendarWindow, parseYm } from "@/lib/month";
import { WEEKDAY_LABELS, minutesToHHMM } from "@/lib/recurrence";
import { type ScheduleTemplate } from "./ScheduleForm";
import { CalendarView } from "./CalendarView";
import {
  updateScheduleAction,
  cancelScheduleAction,
  deleteScheduleAction,
  setScheduleSettledAction,
  ensureCalendarTokenAction,
} from "./actions";

// 화면에 실제로 쓰는 컬럼만 조회 — RSC 페이로드 축소
const SCHEDULE_COLS =
  "id, student_id, starts_at, ends_at, status, category, settled";
type ScheduleRow = Pick<
  Schedule,
  "id" | "student_id" | "starts_at" | "ends_at" | "status" | "category" | "settled"
> & {
  students: { name: string; color: string } | null;
};
// 요청 칩의 기준 시각은 원본 수업을 임베드해 조회 (조회 창과 무관하게 정확)
type RequestWithStudent = ChangeRequest & {
  students: { name: string; color: string } | null;
  schedules: { starts_at: string; ends_at: string } | null;
};

const REQ_LABEL: Record<ChangeRequest["type"], string> = {
  add: "추가요청",
  change: "변경요청",
  cancel: "취소요청",
};

export default async function AdminCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ ym?: string }>;
}) {
  const supabase = await createClient();

  // 중심 월(?ym=, 기본 이번달) 주변 창만 조회 — 창 안 월 이동은 클라이언트에서 즉시
  const [year, month] =
    parseYm((await searchParams).ym) ?? currentKstYearMonth();
  const win = calendarWindow(year, month);

  // 서로 독립적인 조회 — 병렬 실행으로 대기 시간을 최대 1회 왕복으로 줄임
  const [
    { data },
    { data: studentRows },
    { data: reqRows },
    { data: tplRows },
  ] = await Promise.all([
    supabase
      .from("schedules")
      .select(`${SCHEDULE_COLS}, students(name, color)`)
      .gte("starts_at", win.fetchStartISO)
      .lt("starts_at", win.fetchEndISO)
      .order("starts_at", { ascending: true }),
    supabase.from("students").select("id, name").eq("active", true).order("name"),
    supabase
      .from("requests")
      .select("*, students(name, color), schedules(starts_at, ends_at)")
      .eq("status", "pending"),
    // 반복 템플릿 → '수업 추가' 적용 목록 (활성 학생 것만)
    supabase.from("recurrence_templates").select("*"),
  ]);

  const schedules = (data ?? []) as unknown as ScheduleRow[];
  const students = (studentRows ?? []) as { id: string; name: string }[];
  const pendingReqs = (reqRows ?? []) as unknown as RequestWithStudent[];
  const nameById = new Map(students.map((s) => [s.id, s.name]));
  const templates: ScheduleTemplate[] = ((tplRows ?? []) as RecurrenceTemplate[])
    .filter((t) => nameById.has(t.student_id))
    .sort((a, b) => a.weekday - b.weekday || a.start_minute - b.start_minute)
    .map((t) => ({
      id: t.id,
      studentId: t.student_id,
      weekday: t.weekday,
      startMinute: t.start_minute,
      duration: t.duration,
      label: `${nameById.get(t.student_id)} · ${WEEKDAY_LABELS[t.weekday]} ${minutesToHHMM(
        t.start_minute,
      )} (${durationLabel(t.duration)})`,
    }));

  const confirmedEvents: CalendarEvent[] = schedules.map((s) => ({
    id: s.id,
    scheduleId: s.id,
    studentId: s.student_id,
    title: s.students?.name ?? "?",
    color: s.students?.color ?? "#888",
    startsAt: s.starts_at,
    endsAt: s.ends_at,
    status: s.status,
    tag: categoryTag(s.status, s.category),
    settled: s.settled,
    settleable: s.category === "added" || s.category === "changed",
  }));

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
      title: r.students?.name ?? "?",
      tag: REQ_LABEL[r.type],
      color: r.students?.color ?? "#888",
      startsAt,
      endsAt: endsAt ?? undefined,
      status: "confirmed" as const,
      pending: true,
      requestType: r.type,
    };
  });

  const events = [...confirmedEvents, ...pendingEvents];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">캘린더 (전체 학생)</h1>

      <CalendarView
        // 중심 월이 바뀌면 리마운트해 표시 월 상태를 새 창에 맞춘다
        key={`${year}-${month}`}
        events={events}
        students={students}
        templates={templates}
        initialYear={year}
        initialMonth={month}
        viewMinYm={win.viewMinYm}
        viewMaxYm={win.viewMaxYm}
        changeAction={updateScheduleAction}
        cancelAction={cancelScheduleAction}
        deleteAction={deleteScheduleAction}
        settleAction={setScheduleSettledAction}
        subscribeAction={ensureCalendarTokenAction}
      />
    </div>
  );
}
