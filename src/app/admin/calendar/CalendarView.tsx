"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  MonthCalendar,
  type CalendarEvent,
  type ActionState,
} from "@/components/MonthCalendar";
import { kstDateKey, kstTime, kstWeekday } from "@/lib/datetime";
import { ymKey } from "@/lib/month";
import { ScheduleForm, type ScheduleTemplate } from "./ScheduleForm";

type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;
type SubscribeAction = (
  studentId: string,
) => Promise<{ token?: string; error?: string }>;

const input =
  "rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

const pad2 = (n: number) => String(n).padStart(2, "0");

/** 값이 바뀔 일이 없는 클라이언트 전용 판정용 — 구독하지 않는다 */
const NO_SUBSCRIBE = () => () => {};

/** 휴대폰·태블릿 여부 — 데스크톱에서는 OS 공유 시트를 쓰지 않는다 */
const isTouchDevice = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(pointer: coarse)").matches;

/** 해당 월 확정 수업(취소·요청 제외)을 "6/7(일): 14:00~17:00" 형식 텍스트로 추출 */
function buildScheduleText(
  events: CalendarEvent[],
  year: number,
  month: number,
): string {
  const prefix = `${year}-${pad2(month)}`;
  return events
    .filter(
      (e) =>
        !e.pending &&
        e.status === "confirmed" &&
        kstDateKey(e.startsAt).startsWith(prefix),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((e) => {
      const [, m, d] = kstDateKey(e.startsAt).split("-").map(Number);
      const time = e.endsAt
        ? `${kstTime(e.startsAt)}~${kstTime(e.endsAt)}`
        : kstTime(e.startsAt);
      return `${m}/${d}(${kstWeekday(e.startsAt)}): ${time}`;
    })
    .join("\n");
}

export function CalendarView({
  events,
  students,
  templates,
  initialYear,
  initialMonth,
  viewMinYm,
  viewMaxYm,
  changeAction,
  cancelAction,
  deleteAction,
  settleAction,
  subscribeAction,
}: {
  events: CalendarEvent[];
  students: { id: string; name: string }[];
  templates: ScheduleTemplate[];
  initialYear: number;
  initialMonth: number;
  viewMinYm: string;
  viewMaxYm: string;
  changeAction: FormAction;
  cancelAction: FormAction;
  deleteAction: FormAction;
  settleAction: FormAction;
  subscribeAction: SubscribeAction;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<string>("all");
  // 표시 월 — 수업 추가의 '템플릿 적용'이 이 월을 기준으로 날짜를 계산한다.
  const [[year, month], setYM] = useState<[number, number]>([
    initialYear,
    initialMonth,
  ]);

  function handleMonthChange(y: number, m: number) {
    const key = ymKey(y, m);
    if (key < viewMinYm || key > viewMaxYm) {
      // 로드된 창 밖 → 해당 월 중심으로 서버에서 다시 조회
      router.push(`/admin/calendar?ym=${key}`);
      return;
    }
    setYM([y, m]);
  }

  const filtered = useMemo(
    () =>
      filter === "all"
        ? events
        : events.filter((e) => e.studentId === filter),
    [events, filter],
  );

  return (
    <div className="space-y-6">
      <details className="rounded-lg border border-black/10 dark:border-white/15">
        <summary className="cursor-pointer p-3 text-sm font-medium">
          + 수업 추가
        </summary>
        <div className="border-t border-black/10 p-3 dark:border-white/15">
          <ScheduleForm
            students={students}
            templates={templates}
            events={events}
            year={year}
            month={month}
          />
        </div>
      </details>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium">학생 보기</span>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={input}
            >
              <option value="all">전체 학생</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          {filter !== "all" && (
            <ExtractButton events={filtered} year={year} month={month} />
          )}
          <CaptureButton
            events={filtered}
            year={year}
            month={month}
            showName={filter === "all"}
            studentName={
              students.find((s) => s.id === filter)?.name ?? null
            }
          />
          <SubscribeButton
            key={filter}
            studentId={filter}
            subscribeAction={subscribeAction}
          />
        </div>

        <MonthCalendar
          events={filtered}
          showName={filter === "all"}
          showEndTime
          year={year}
          month={month}
          onMonthChange={handleMonthChange}
          changeAction={changeAction}
          cancelAction={cancelAction}
          deleteAction={deleteAction}
          settleAction={settleAction}
          changeLabel="시간 변경 저장"
          cancelLabel="수업 취소"
          deleteLabel="수업 삭제"
        />
      </div>
    </div>
  );
}

/** 표시 중인 월의 해당 학생 일정을 텍스트로 클립보드에 복사 */
function ExtractButton({
  events,
  year,
  month,
}: {
  events: CalendarEvent[];
  year: number;
  month: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = buildScheduleText(events, year, month);
    if (!text) {
      window.alert("이 달에 복사할 일정이 없습니다.");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // 클립보드 API 미지원/거부 시 폴백
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={copy}
        className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
      >
        {copied ? "복사됨 ✓" : "일정 추출"}
      </button>
      <HelpTooltip
        text={
          "지금 보고 있는 달의 확정 수업 일정을 '6/7(일): 14:00~17:00' 형식 텍스트로 클립보드에 복사합니다.\n취소된 수업은 제외되며, 복사한 내용을 학부모에게 그대로 전달할 수 있습니다."
        }
      />
    </span>
  );
}

/**
 * 표시 중인 달의 캘린더를 PNG 이미지로 만들어 저장/공유 — 학부모 전달용.
 * 화면을 캡처하는 대신 같은 데이터로 캔버스에 다시 그리므로 다크 모드·스크롤·
 * 잘림에 영향받지 않는다. 학생을 선택해 두면 그 학생 일정만 담긴다.
 */
function CaptureButton({
  events,
  year,
  month,
  showName,
  studentName,
}: {
  events: CalendarEvent[];
  year: number;
  month: number;
  showName: boolean;
  studentName: string | null;
}) {
  const [busy, setBusy] = useState<"save" | "copy" | null>(null);
  const [done, setDone] = useState<{ kind: "save" | "copy"; label: string } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  // 데스크톱에서만 '복사' 노출 — window 에 의존하므로 서버에서는 false 로 렌더
  const canCopy = useSyncExternalStore(
    NO_SUBSCRIBE,
    () => typeof ClipboardItem !== "undefined" && !isTouchDevice(),
    () => false,
  );

  const fileName = `${year}-${pad2(month)}_${studentName ?? "전체"}_수업일정.png`;

  /** 이미지 렌더러는 실제로 누를 때만 받아온다(초기 번들에서 제외) */
  async function png(): Promise<Blob> {
    const { renderCalendarPng } = await import("@/lib/calendarImage");
    return renderCalendarPng({
      events,
      year,
      month,
      showName,
      subtitle: studentName ?? "전체 학생",
    });
  }

  function flash(kind: "save" | "copy", label: string) {
    setDone({ kind, label });
    setTimeout(() => setDone(null), 2000);
  }

  function download(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    flash("save", "저장됨 ✓");
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      const blob = await png();
      const file = new File([blob], fileName, { type: "image/png" });
      // 공유 시트는 휴대폰·태블릿에서만 — 데스크톱 OS 공유 시트의 '복사'는
      // 파일과 이미지 데이터를 함께 넣어 붙여넣을 때 같은 그림이 두 개가 된다.
      if (isTouchDevice() && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: `${year}년 ${month}월 수업 일정`,
          });
          flash("save", "공유됨 ✓");
        } catch (e) {
          // 사용자가 공유 시트를 닫음 → 아무것도 하지 않음
          if ((e as Error)?.name === "AbortError") return;
          // 이미지를 만드는 사이 클릭 권한이 만료된 경우(사파리 등) → 저장으로 폴백
          download(blob);
        }
      } else {
        download(blob);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 생성에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  /** PNG 하나만 클립보드에 넣는다 — 카톡·메신저에 붙여넣으면 그림 한 장 */
  async function copy() {
    setBusy("copy");
    setError(null);
    try {
      // 사파리는 await 이후의 클립보드 쓰기를 막으므로 Promise 를 그대로 넘긴다
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": png() }),
      ]);
      flash("copy", "복사됨 ✓");
    } catch (e) {
      setError(e instanceof Error ? e.message : "이미지 복사에 실패했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const label = (kind: "save" | "copy", idle: string) =>
    busy === kind ? "만드는 중…" : done?.kind === kind ? done.label : idle;

  return (
    <>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={save}
          disabled={busy !== null}
          className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {label("save", "이미지 저장")}
        </button>
        {canCopy && (
          <button
            type="button"
            onClick={copy}
            disabled={busy !== null}
            className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
          >
            {label("copy", "이미지 복사")}
          </button>
        )}
        <HelpTooltip
          text={
            "지금 보고 있는 달의 캘린더를 그대로 PNG 이미지로 만듭니다. 휴대폰에서는 공유 시트가 열려 카톡 등으로 바로 보낼 수 있고, 컴퓨터에서는 파일로 저장하거나 '이미지 복사'로 클립보드에 담아 바로 붙여넣을 수 있습니다.\n학생을 선택해 두면 그 학생 일정만 담기고, 흰 배경으로 그려지므로 다크 모드에서도 그대로 전달할 수 있습니다."
          }
        />
      </span>
      {error && <p className="basis-full text-sm text-red-600">{error}</p>}
    </>
  );
}

/** 작은 원형 물음표 버튼 — 클릭하면 안내 박스를 열고 닫는다 */
function HelpTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="도움말"
        aria-expanded={open}
        className="flex h-4 w-4 items-center justify-center rounded-full border border-black/30 text-[10px] font-medium leading-none text-black/60 hover:bg-black/5 dark:border-white/30 dark:text-white/60 dark:hover:bg-white/10"
      >
        ?
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-1/2 top-full z-10 mt-1 w-56 -translate-x-1/2 whitespace-pre-line rounded-md border border-black/10 bg-white p-2 text-xs leading-relaxed text-black/70 shadow-lg dark:border-white/15 dark:bg-neutral-900 dark:text-white/70"
        >
          {text}
        </div>
      )}
    </span>
  );
}

/**
 * 해당 학생의 구독(webcal) URL 발급 — 항상 최신 상태로 자동 동기화되는 방식.
 * 클릭 시 비밀 토큰을 발급받아 webcal:// URL 을 만들고 클립보드에 복사한다.
 */
function SubscribeButton({
  studentId,
  subscribeAction,
}: {
  studentId: string;
  subscribeAction: SubscribeAction;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scopeLabel = studentId === "all" ? "전체 학생의" : "이 학생의";

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await subscribeAction(studentId);
    setLoading(false);
    if (res.error || !res.token) {
      setError(res.error ?? "구독 URL 발급에 실패했습니다.");
      return;
    }
    // webcal:// 스킴이면 맥·아이폰에서 클릭 시 캘린더 구독 화면이 바로 열린다.
    const base = window.location.origin.replace(/^https?:/, "webcal:");
    const full = `${base}/api/calendar/${res.token}`;
    setUrl(full);
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 복사 실패해도 URL 은 아래에 노출되므로 무시
    }
  }

  return (
    <>
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={generate}
          disabled={loading}
          className="rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
        >
          {loading ? "발급 중…" : copied ? "URL 복사됨 ✓" : "구독 URL"}
        </button>
        <HelpTooltip
          text={
            "캘린더 앱에 한 번 구독해 두면 이후 일정이 바뀌어도 자동으로 동기화되는 비밀 webcal 주소를 발급합니다.\n학생별로 발급하거나, 전체 학생 선택 시 모든 학생 일정을 이름별로 한 캘린더에서 볼 수 있습니다.\n주소를 아는 사람은 누구나 일정을 볼 수 있으니 공유에 주의하세요."
          }
        />
      </span>

      {error && <p className="basis-full text-sm text-red-600">{error}</p>}

      {url && (
        <div className="basis-full space-y-1 rounded-md border border-black/10 p-3 text-sm dark:border-white/15">
          <p className="text-black/60 dark:text-white/60">
            맥 캘린더 앱에 구독하면 이후 일정이 바뀌어도 자동으로 동기화됩니다.{" "}
            <a href={url} className="font-medium underline">
              구독하기
            </a>{" "}
            를 누르거나, 아래 URL 을 <b>캘린더 › 파일 › 새로운 캘린더 구독</b> 에
            붙여넣으세요.
          </p>
          <code className="block break-all rounded bg-black/5 px-2 py-1 text-xs dark:bg-white/10">
            {url}
          </code>
          <p className="text-xs text-amber-600 dark:text-amber-500">
            ⚠️ 이 주소를 아는 사람은 누구나 {scopeLabel} 일정을 볼 수 있으니 공유에
            주의하세요.
          </p>
        </div>
      )}
    </>
  );
}
