import { createAdminClient } from "@/lib/supabase/admin";
import { buildICS, type ICSEvent } from "@/lib/ics";

// 인증 없이 접근되는 구독 피드 — 항상 최신 DB를 반영해야 하므로 정적 캐시 금지.
export const dynamic = "force-dynamic";

/**
 * 학생별 캘린더 구독 피드 (webcal). 비밀 토큰으로만 접근 가능.
 * 취소 수업을 제외한 확정 수업 전체를 iCalendar(.ics)로 반환한다.
 * 맥·아이폰 캘린더 앱이 이 URL을 주기적으로 폴링해 자동 동기화한다.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  if (!token) return new Response("Not found", { status: 404 });

  // 인증 세션이 없으므로 service_role 로 조회 (해당 토큰 범위의 일정만 노출).
  const admin = createAdminClient();

  // 1) 개별 학생 토큰
  const { data: student } = await admin
    .from("students")
    .select("id, name")
    .eq("calendar_token", token)
    .maybeSingle();

  if (student) {
    const { data: rows } = await admin
      .from("schedules")
      .select("id, starts_at, ends_at")
      .eq("student_id", student.id)
      .eq("status", "confirmed")
      .order("starts_at", { ascending: true });

    const events: ICSEvent[] = (rows ?? []).map((s) => ({
      uid: s.id,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
    }));
    return icsResponse(buildICS(events, `${student.name} 과외`), student.id);
  }

  // 2) 전체 학생 토큰(settings) — 모든 확정 수업을 학생명으로 구분해 반환
  const { data: settings } = await admin
    .from("settings")
    .select("id")
    .eq("calendar_token", token)
    .maybeSingle();

  if (settings) {
    const { data: rows } = await admin
      .from("schedules")
      .select("id, starts_at, ends_at, students!inner(name)")
      .eq("status", "confirmed")
      .order("starts_at", { ascending: true });

    const events: ICSEvent[] = (
      (rows ?? []) as unknown as {
        id: string;
        starts_at: string;
        ends_at: string;
        students: { name: string };
      }[]
    ).map((s) => ({
      uid: s.id,
      startsAt: s.starts_at,
      endsAt: s.ends_at,
      summary: s.students.name,
    }));
    return icsResponse(buildICS(events, "과외 전체 일정"), "all");
  }

  return new Response("Not found", { status: 404 });
}

function icsResponse(ics: string, filenameKey: string) {
  return new Response(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="tutorhub-${filenameKey}.ics"`,
      // 캘린더 앱은 자체 주기로 폴링 — 과도한 캐시만 피한다.
      "Cache-Control": "public, max-age=1800",
    },
  });
}
