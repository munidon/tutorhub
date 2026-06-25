// ============================================================
// Supabase Edge Function: notify-telegram
// requests 테이블 INSERT 시 Database Webhook 으로 호출되어
// 선생님 Telegram 으로 새 요청 알림을 보낸다.
//
// 배포:
//   supabase functions deploy notify-telegram --no-verify-jwt
// 시크릿:
//   supabase secrets set TELEGRAM_BOT_TOKEN=123:ABC TELEGRAM_CHAT_ID=123456 SITE_URL=https://your.app
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 는 런타임이 자동 주입)
// 연결:
//   Supabase 대시보드 > Database > Webhooks > Create
//     table: public.requests, events: INSERT, type: Supabase Edge Functions → notify-telegram
//
// 이 파일은 Deno 런타임에서 실행되며 Next(tsc) 빌드 대상에서 제외된다.
// ============================================================

interface WebhookPayload {
  type: "INSERT" | "UPDATE" | "DELETE";
  table: string;
  record: Record<string, unknown> | null;
}

const TYPE_LABEL: Record<string, string> = {
  add: "추가",
  change: "변경",
  cancel: "취소",
};

// students 테이블에서 학생 이름 조회 (service role 로 RLS 우회).
async function fetchStudentName(studentId: string): Promise<string | null> {
  // @ts-expect-error: Deno 전역은 Edge 런타임에서 제공됨
  const url = Deno.env.get("SUPABASE_URL");
  // @ts-expect-error: Deno 전역
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !studentId) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/students?id=eq.${studentId}&select=name`,
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { name?: string }[];
    return rows[0]?.name ?? null;
  } catch {
    return null;
  }
}

// @ts-expect-error: Deno 전역은 Edge 런타임에서 제공됨
Deno.serve(async (req: Request) => {
  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    return new Response("bad request", { status: 400 });
  }

  if (payload.type !== "INSERT" || payload.table !== "requests") {
    return new Response("ignored", { status: 200 });
  }

  // @ts-expect-error: Deno 전역
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  // @ts-expect-error: Deno 전역
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");
  // @ts-expect-error: Deno 전역
  const site = Deno.env.get("SITE_URL") ?? "";

  if (!token || !chatId) {
    return new Response("missing secrets", { status: 500 });
  }

  const r = payload.record ?? {};
  const typeLabel = TYPE_LABEL[String(r.type)] ?? String(r.type);
  const studentName =
    (await fetchStudentName(String(r.student_id ?? ""))) ?? "학생";
  const note = String(r.note ?? "").trim();

  // 📌 {학생}의 새 {추가/변경/취소} 요청이 도착했습니다.
  // {요청 메세지}   ← note 가 있을 때만
  //
  // 승인하기 ▶ {site}/admin/requests
  const lines = [`📌 ${studentName} 학부모님의 새 ${typeLabel} 요청이 도착했습니다.`];
  if (note) lines.push(`\n요청 메세지: ${note}`);
  lines.push(`\n승인하기 ▶ ${site}/admin/requests`);
  const text = lines.join("\n");

  const res = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );

  return new Response(res.ok ? "sent" : "telegram error", {
    status: res.ok ? 200 : 502,
  });
});
