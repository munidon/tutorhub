import { createClient } from "@/lib/supabase/server";
import type { Schedule, ChangeRequest, RecurrenceTemplate } from "@/lib/types";
import type { CalendarEvent } from "@/components/MonthCalendar";
import { categoryTag, durationLabel } from "@/lib/schedule";
import { WEEKDAY_LABELS, minutesToHHMM } from "@/lib/recurrence";
import { type ScheduleTemplate } from "./ScheduleForm";
import { CalendarView } from "./CalendarView";
import {
  updateScheduleAction,
  cancelScheduleAction,
  deleteScheduleAction,
  setScheduleSettledAction,
} from "./actions";

type ScheduleWithStudent = Schedule & {
  students: { name: string; color: string } | null;
};
type RequestWithStudent = ChangeRequest & {
  students: { name: string; color: string } | null;
};

const REQ_LABEL: Record<ChangeRequest["type"], string> = {
  add: "추가요청",
  change: "변경요청",
  cancel: "취소요청",
};

export default async function AdminCalendarPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("schedules")
    .select("*, students(name, color)")
    .order("starts_at", { ascending: true });

  const schedules = (data ?? []) as ScheduleWithStudent[];

  const { data: studentRows } = await supabase
    .from("students")
    .select("id, name")
    .eq("active", true)
    .order("name");
  const students = (studentRows ?? []) as { id: string; name: string }[];

  const { data: reqRows } = await supabase
    .from("requests")
    .select("*, students(name, color)")
    .eq("status", "pending");
  const pendingReqs = (reqRows ?? []) as RequestWithStudent[];

  // 반복 템플릿 → '수업 추가' 적용 목록 (활성 학생 것만)
  const { data: tplRows } = await supabase
    .from("recurrence_templates")
    .select("*");
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

  const scheduleById = new Map(schedules.map((s) => [s.id, s]));

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
        events={events}
        students={students}
        templates={templates}
        changeAction={updateScheduleAction}
        cancelAction={cancelScheduleAction}
        deleteAction={deleteScheduleAction}
        settleAction={setScheduleSettledAction}
      />
    </div>
  );
}
