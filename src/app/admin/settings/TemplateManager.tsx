import type { RecurrenceTemplate } from "@/lib/types";
import { durationLabel } from "@/lib/schedule";
import { WEEKDAY_LABELS, minutesToHHMM } from "@/lib/recurrence";
import { DurationSelect } from "@/components/DurationSelect";
import { addTemplateAction, deleteTemplateAction } from "./actions";

const input =
  "w-full rounded-md border border-black/15 px-2 py-1.5 text-sm dark:border-white/20 dark:bg-transparent";

/**
 * 학생별 반복 일정 템플릿 관리 (생성/삭제).
 * 수정은 '삭제 후 재생성'으로 갈음(템플릿이 단순해 별도 편집 UI 불필요).
 */
export function TemplateManager({
  students,
  templates,
}: {
  students: { id: string; name: string }[];
  templates: RecurrenceTemplate[];
}) {
  if (students.length === 0) {
    return (
      <p className="rounded-md border border-black/10 p-3 text-sm text-black/60 dark:border-white/15 dark:text-white/60">
        먼저 <span className="font-medium">학생/계정</span> 탭에서 학생을 등록하세요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {students.map((st) => {
        const list = templates
          .filter((t) => t.student_id === st.id)
          .sort((a, b) =>
            a.weekday - b.weekday || a.start_minute - b.start_minute,
          );
        return (
          <div
            key={st.id}
            className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/15"
          >
            <div className="font-medium">{st.name}</div>

            {list.length === 0 ? (
              <p className="text-sm text-black/55 dark:text-white/55">
                등록된 템플릿이 없습니다.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {list.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 rounded-md border border-black/10 px-2 py-1 text-sm dark:border-white/15"
                  >
                    <span>
                      {WEEKDAY_LABELS[t.weekday]} {minutesToHHMM(t.start_minute)} (
                      {durationLabel(t.duration)})
                    </span>
                    <form action={deleteTemplateAction}>
                      <input type="hidden" name="template_id" value={t.id} />
                      <button
                        type="submit"
                        className="text-xs text-red-600 hover:underline"
                        aria-label="템플릿 삭제"
                      >
                        삭제
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            {/* 추가 폼 */}
            <form
              action={addTemplateAction}
              className="flex flex-wrap items-end gap-2"
            >
              <input type="hidden" name="student_id" value={st.id} />
              <label className="space-y-1 text-xs">
                <span className="text-black/55 dark:text-white/55">요일</span>
                <select name="weekday" defaultValue="1" className={input}>
                  {WEEKDAY_LABELS.map((w, i) => (
                    <option key={i} value={i}>
                      {w}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-black/55 dark:text-white/55">시작</span>
                <input
                  type="time"
                  name="start"
                  step={1800}
                  defaultValue="16:00"
                  required
                  className={input}
                />
              </label>
              <label className="space-y-1 text-xs">
                <span className="text-black/55 dark:text-white/55">수업 시간</span>
                <DurationSelect className={input} />
              </label>
              <button
                type="submit"
                className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background"
              >
                추가
              </button>
            </form>
          </div>
        );
      })}
    </div>
  );
}
