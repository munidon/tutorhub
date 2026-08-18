import { createClient } from "@/lib/supabase/server";
import type {
  Schedule,
  ChangeRequest,
  RecurrenceTemplate,
  ScheduleChange,
} from "@/lib/types";
import type { CalendarEvent, ChangeLogEntry } from "@/components/MonthCalendar";
import {
  scheduleTag,
  movedAcrossMonths,
  hasAdjustment,
  CARRIED_OUT_TAG,
  currentKstYearMonth,
  durationLabel,
} from "@/lib/schedule";
import { SHOW_CHANGE_LOG } from "@/lib/flags";
import { calendarWindow, parseYm } from "@/lib/month";
import { WEEKDAY_LABELS, minutesToHHMM } from "@/lib/recurrence";
import { type ScheduleTemplate } from "./ScheduleForm";
import { CalendarView } from "./CalendarView";
import {
  updateScheduleAction,
  cancelScheduleAction,
  restoreScheduleAction,
  revertScheduleAction,
  deleteScheduleAction,
  setScheduleSettledAction,
  ensureCalendarTokenAction,
} from "./actions";

// 화면에 실제로 쓰는 컬럼만 조회 — RSC 페이로드 축소
const SCHEDULE_COLS =
  "id, student_id, starts_at, ends_at, status, base_category, origin_starts_at, origin_ends_at, settled";
type ScheduleRow = Pick<
  Schedule,
  | "id"
  | "student_id"
  | "starts_at"
  | "ends_at"
  | "status"
  | "base_category"
  | "origin_starts_at"
  | "origin_ends_at"
  | "settled"
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
      // 다른 달로 옮겨진 수업은 '계획된 달'에도 흔적을 남겨야 하므로
      // 현재 시각과 최초 계획 시각 중 하나라도 창 안이면 가져온다
      .or(
        `and(starts_at.gte."${win.fetchStartISO}",starts_at.lt."${win.fetchEndISO}"),` +
          `and(origin_starts_at.gte."${win.fetchStartISO}",origin_starts_at.lt."${win.fetchEndISO}")`,
      )
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

  // 변경 이력 — 노출 플래그가 꺼져 있으면 조회 자체를 생략
  const logBySchedule = new Map<string, ChangeLogEntry[]>();
  if (SHOW_CHANGE_LOG && schedules.length > 0) {
    const { data: logRows } = await supabase
      .from("schedule_changes")
      .select("schedule_id, kind, from_starts, from_ends, to_starts, to_ends, changed_at")
      .in(
        "schedule_id",
        schedules.map((s) => s.id),
      )
      .order("changed_at", { ascending: true });
    for (const r of (logRows ?? []) as ScheduleChange[]) {
      const list = logBySchedule.get(r.schedule_id) ?? [];
      list.push({
        kind: r.kind,
        fromStarts: r.from_starts,
        fromEnds: r.from_ends,
        toStarts: r.to_starts,
        toEnds: r.to_ends,
        changedAt: r.changed_at,
      });
      logBySchedule.set(r.schedule_id, list);
    }
  }

  const confirmedEvents: CalendarEvent[] = schedules.flatMap((s) => {
    const base = {
      studentId: s.student_id,
      title: s.students?.name ?? "?",
      color: s.students?.color ?? "#888",
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
      settleable: hasAdjustment(s),
      changeLog: logBySchedule.get(s.id),
      originStartsAt: s.origin_starts_at,
      originEndsAt: s.origin_ends_at,
    };
    // 다른 달로 옮겨진 수업은 계획됐던 자리에 '빠져나감' 표시를 남긴다.
    // status:"cancelled" 로 두면 MonthCalendar 가 흐린 취소선 + 클릭 불가로 렌더한다.
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
        restoreAction={restoreScheduleAction}
        revertAction={revertScheduleAction}
        deleteAction={deleteScheduleAction}
        settleAction={setScheduleSettledAction}
        subscribeAction={ensureCalendarTokenAction}
      />
    </div>
  );
}
