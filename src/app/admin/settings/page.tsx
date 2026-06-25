import { createClient } from "@/lib/supabase/server";
import type { Settings, RecurrenceTemplate } from "@/lib/types";
import { updateSettingsAction } from "./actions";
import { TemplateManager } from "./TemplateManager";

export default async function AdminSettingsPage() {
  const supabase = await createClient();
  const [{ data }, { data: studentRows }, { data: tplRows }] = await Promise.all([
    supabase.from("settings").select("*").eq("id", 1).single(),
    supabase.from("students").select("id, name").eq("active", true).order("name"),
    supabase.from("recurrence_templates").select("*"),
  ]);

  const settings = (data ?? null) as Settings | null;
  const students = (studentRows ?? []) as { id: string; name: string }[];
  const templates = (tplRows ?? []) as RecurrenceTemplate[];

  // 현재 등록된 계좌 표시 (학부모 청구서에 보이는 형식과 동일)
  const currentAccount =
    [settings?.bank_name, settings?.account_number].filter(Boolean).join(" ") +
    (settings?.account_holder ? ` (${settings.account_holder})` : "");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">설정</h1>

      <form
        action={updateSettingsAction}
        className="max-w-lg space-y-4 rounded-lg border border-black/10 p-4 dark:border-white/15"
      >
        <div className="space-y-2">
          <span className="text-sm font-medium">
            입금 계좌 (학부모 청구서 안내용)
          </span>
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              name="bank_name"
              defaultValue={settings?.bank_name ?? ""}
              placeholder="은행 (예: 카카오뱅크)"
              className="w-full rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            />
            <input
              name="account_number"
              defaultValue={settings?.account_number ?? ""}
              placeholder="계좌번호 (예: 3333-00-0000000)"
              className="w-full rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            />
            <input
              name="account_holder"
              defaultValue={settings?.account_holder ?? ""}
              placeholder="예금주 (예: 홍길동)"
              className="w-full rounded-md border border-black/15 px-3 py-2 dark:border-white/20 dark:bg-transparent"
            />
          </div>
          <span className="text-xs text-black/55 dark:text-white/55">
            학부모 청구서에는 계좌번호 옆 <b>복사</b> 버튼이 계좌번호만 복사합니다.
          </span>
          <div className="rounded-md bg-black/[0.03] px-3 py-2 text-sm dark:bg-white/[0.04]">
            <span className="text-black/55 dark:text-white/55">현재 등록: </span>
            {currentAccount.trim() ? (
              <span className="font-medium">{currentAccount}</span>
            ) : (
              <span className="text-black/45 dark:text-white/45">미설정</span>
            )}
          </div>
        </div>

        <button
          type="submit"
          className="rounded-md bg-foreground px-4 py-2 font-medium text-background"
        >
          저장
        </button>
      </form>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">반복 일정 템플릿</h2>
          <p className="text-sm text-black/55 dark:text-white/55">
            학생별 고정 수업(요일·시작·길이)을 저장하면, 캘린더 <b>수업 추가</b>에서
            한 번에 적용할 수 있습니다.
          </p>
        </div>
        <TemplateManager students={students} templates={templates} />
      </section>
    </div>
  );
}
