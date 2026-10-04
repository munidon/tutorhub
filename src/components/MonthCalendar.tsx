"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { kstDateKey, kstTime, isoToKstLocal } from "@/lib/datetime";
import { snapDurationMinutes } from "@/lib/schedule";
import { DurationSelect } from "@/components/DurationSelect";
import type { ScheduleChangeKind } from "@/lib/types";

/** 수업 변경 이력 한 줄 (선생님 모달에서만 노출) */
export type ChangeLogEntry = {
  kind: ScheduleChangeKind;
  fromStarts: string | null;
  fromEnds: string | null;
  toStarts: string | null;
  toEnds: string | null;
  changedAt: string;
};

export type CalendarEvent = {
  id: string; // 칩 key (schedule id 또는 req-<id>)
  scheduleId?: string; // 클릭 액션 대상 schedule id
  studentId?: string;
  title: string;
  color: string;
  startsAt: string; // ISO(UTC)
  endsAt?: string; // ISO(UTC) — 변경 모달 프리필용
  status: "confirmed" | "cancelled";
  pending?: boolean; // 학부모 요청 오버레이(점선)
  requestType?: "add" | "change" | "cancel";
  tag?: string; // 칩에 붙는 라벨(예: "변경요청")
  settled?: boolean; // 직접 수령(정산 완료)
  settleable?: boolean; // 정산 처리 가능(이월 기여분이 0 이 아닌 경우)
  changeLog?: ChangeLogEntry[]; // 변경 이력(선생님 전용, SHOW_CHANGE_LOG)
  // 최초 계획 시각 — 현재 시각과 다르면 '되돌리기' 노출
  originStartsAt?: string;
  originEndsAt?: string;
};

/** 최초 계획에서 시간이 바뀐 상태인가 (되돌릴 게 있는가) */
function canRevert(e: CalendarEvent): boolean {
  if (!e.originStartsAt || e.status !== "confirmed") return false;
  const moved =
    new Date(e.originStartsAt).getTime() !== new Date(e.startsAt).getTime();
  const resized =
    e.originEndsAt != null &&
    e.endsAt != null &&
    new Date(e.originEndsAt).getTime() !== new Date(e.endsAt).getTime();
  return moved || resized;
}

export type ActionState = { ok?: boolean; error?: string };
type FormAction = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");

const btn =
  "rounded-md border border-black/15 px-2 py-1 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";
const input =
  "mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent";

function todayParts() {
  const key = kstDateKey(new Date().toISOString());
  const [y, m] = key.split("-").map(Number);
  return { y, m, key };
}

export function MonthCalendar({
  events,
  showName = true,
  changeAction,
  cancelAction,
  restoreAction,
  revertAction,
  deleteAction,
  settleAction,
  changeLabel = "시간 변경",
  cancelLabel = "취소",
  deleteLabel = "수업 삭제",
  requestMode = false,
  showEndTime = false,
  year: yearProp,
  month: monthProp,
  onMonthChange,
}: {
  events: CalendarEvent[];
  showName?: boolean;
  changeAction?: FormAction;
  cancelAction?: FormAction;
  restoreAction?: FormAction; // 취소 해제(선생님 전용) — 있으면 취소된 수업도 모달이 열린다
  revertAction?: FormAction; // 변경 롤백(선생님 전용) — 최초 계획 시간으로 복원
  deleteAction?: FormAction;
  settleAction?: FormAction;
  changeLabel?: string;
  cancelLabel?: string;
  deleteLabel?: string;
  requestMode?: boolean; // 학부모 요청 모드 → 요청 메시지 입력칸 노출
  showEndTime?: boolean; // 칩에 종료 시간까지 표시(시작~종료). 기본은 시작만(모바일 잘림 방지)
  // 표시 월을 부모가 제어하려면 셋을 모두 전달(미전달 시 내부 상태로 동작)
  year?: number;
  month?: number;
  onMonthChange?: (year: number, month: number) => void;
}) {
  const today = useMemo(() => todayParts(), []);
  const controlled =
    yearProp != null && monthProp != null && onMonthChange != null;
  const [iYear, setIYear] = useState(today.y);
  const [iMonth, setIMonth] = useState(today.m); // 1-12
  const year = controlled ? yearProp! : iYear;
  const month = controlled ? monthProp! : iMonth;
  const setYearMonth = (y: number, m: number) => {
    if (controlled) onMonthChange!(y, m);
    else {
      setIYear(y);
      setIMonth(m);
    }
  };
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const interactive = Boolean(changeAction && cancelAction);
  const closeModal = useCallback(() => setSelected(null), []);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      const key = kstDateKey(e.startsAt);
      (map.get(key) ?? map.set(key, []).get(key)!).push(e);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    }
    return map;
  }, [events]);

  // 칩 시간 라벨은 이벤트당 한 번만 계산 (렌더마다 kstTime 반복 방지)
  const timeById = useMemo(() => {
    const map = new Map<string, { start: string; range: string }>();
    for (const e of events) {
      const start = kstTime(e.startsAt);
      map.set(e.id, {
        start,
        range: e.endsAt ? `${start}~${kstTime(e.endsAt)}` : start,
      });
    }
    return map;
  }, [events]);

  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  const cells = Array.from({ length: totalCells }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1, i - firstDow + 1));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    return {
      key: `${y}-${pad(m)}-${pad(d)}`,
      day: d,
      dow: date.getUTCDay(),
      inMonth: m === month && y === year,
    };
  });

  function go(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setYearMonth(y, m);
  }

  // 고스트 칩(다른 달로 빠져나간 흔적)은 scheduleId 가 없어 열리지 않는다.
  // 취소된 수업은 되살릴 수단(restoreAction)이 있을 때만 연다.
  function canOpen(e: CalendarEvent) {
    if (!interactive || e.pending || !e.scheduleId) return false;
    return e.status === "confirmed" || Boolean(restoreAction);
  }

  function clickEvent(e: CalendarEvent) {
    if (canOpen(e)) setSelected(e);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">
          {year}년 {month}월
        </h2>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => go(-1)} className={btn} aria-label="이전 달">
            ‹
          </button>
          <button
            type="button"
            onClick={() => setYearMonth(today.y, today.m)}
            className={btn}
          >
            오늘
          </button>
          <button type="button" onClick={() => go(1)} className={btn} aria-label="다음 달">
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-medium">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={
              i === 0
                ? "text-red-500"
                : i === 6
                  ? "text-blue-500"
                  : "text-black/60 dark:text-white/60"
            }
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-black/10 bg-black/10 dark:border-white/15 dark:bg-white/15">
        {cells.map((cell) => {
          const dayEvents = byDay.get(cell.key) ?? [];
          const isToday = cell.key === today.key;
          return (
            <div
              key={cell.key}
              className={`min-h-20 bg-background p-1 ${cell.inMonth ? "" : "opacity-40"}`}
            >
              <div className="text-right">
                <span
                  className={`inline-block rounded px-1 text-xs ${isToday
                      ? "bg-foreground font-bold text-background"
                      : cell.dow === 0
                        ? "text-red-500"
                        : cell.dow === 6
                          ? "text-blue-500"
                          : "text-black/70 dark:text-white/70"
                    }`}
                >
                  {cell.day}
                </span>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {dayEvents.map((e) => {
                  const clickable = canOpen(e);
                  const times = timeById.get(e.id)!;
                  const timeRange = times.range;
                  // 기본은 시작 시간만(좁은 모바일 칸 잘림 방지) — showEndTime 이면 시작~종료
                  const chipTime = showEndTime ? times.range : times.start;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => clickEvent(e)}
                      title={`${e.title} ${timeRange}${e.tag ? ` (${e.tag})` : ""}${e.status === "cancelled" ? " (취소됨)" : ""
                        }`}
                      style={
                        e.pending
                          ? { border: `1px dashed ${e.color}` }
                          : { borderLeft: `3px solid ${e.color}` }
                      }
                      className={`block w-full truncate rounded-sm px-1 py-0.5 text-left text-[11px] leading-tight ${e.pending
                          ? "bg-transparent opacity-80"
                          : "bg-black/5 dark:bg-white/10"
                        } ${e.status === "cancelled"
                          ? "text-black/40 line-through dark:text-white/40"
                          : ""
                        } ${clickable
                          ? "cursor-pointer hover:bg-black/10 dark:hover:bg-white/20"
                          : "cursor-default"
                        }`}
                    >
                      {chipTime}
                      {showName && e.title ? ` ${e.title}` : ""}
                      {e.tag ? ` ${e.tag}` : ""}
                      {e.pending ? " ⏳" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {selected && interactive && (
        <EventModal
          event={selected}
          changeAction={changeAction!}
          cancelAction={cancelAction!}
          restoreAction={restoreAction}
          revertAction={revertAction}
          deleteAction={deleteAction}
          settleAction={settleAction}
          changeLabel={changeLabel}
          cancelLabel={cancelLabel}
          deleteLabel={deleteLabel}
          requestMode={requestMode}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

function EventModal({
  event,
  changeAction,
  cancelAction,
  restoreAction,
  revertAction,
  deleteAction,
  settleAction,
  changeLabel,
  cancelLabel,
  deleteLabel,
  requestMode,
  onClose,
}: {
  event: CalendarEvent;
  changeAction: FormAction;
  cancelAction: FormAction;
  restoreAction?: FormAction;
  revertAction?: FormAction;
  deleteAction?: FormAction;
  settleAction?: FormAction;
  changeLabel: string;
  cancelLabel: string;
  deleteLabel: string;
  requestMode: boolean;
  onClose: () => void;
}) {
  const cancelled = event.status === "cancelled";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-sm space-y-4 overflow-y-auto rounded-xl border border-black/10 bg-background p-4 shadow-xl dark:border-white/15"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: event.color }}
          />
          <span className="font-semibold">{event.title}</span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-black/50 hover:text-black dark:text-white/50 dark:hover:text-white"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>
        <p className="text-sm text-black/60 dark:text-white/60">
          현재: {kstDateKey(event.startsAt)} {kstTime(event.startsAt)}
          {event.endsAt ? `–${kstTime(event.endsAt)}` : ""}
          {cancelled ? " (취소됨)" : ""}
          {canRevert(event) && event.originStartsAt && (
            <>
              <br />
              최초 계획: {kstDateKey(event.originStartsAt)}{" "}
              {kstTime(event.originStartsAt)}
              {event.originEndsAt ? `–${kstTime(event.originEndsAt)}` : ""}
            </>
          )}
        </p>

        {/* 취소된 수업은 되살리기·삭제만 — 시간 변경/재취소는 의미가 없다 */}
        {cancelled ? (
          restoreAction && (
            <RestoreForm event={event} action={restoreAction} onDone={onClose} />
          )
        ) : (
          <>
            <ChangeForm
              event={event}
              action={changeAction}
              label={changeLabel}
              requestMode={requestMode}
              onDone={onClose}
            />
            <CancelForm
              event={event}
              action={cancelAction}
              label={cancelLabel}
              requestMode={requestMode}
              onDone={onClose}
            />
            {revertAction && canRevert(event) && (
              <RevertForm event={event} action={revertAction} onDone={onClose} />
            )}
            {settleAction && event.settleable && (
              <SettleForm event={event} action={settleAction} onDone={onClose} />
            )}
          </>
        )}
        {deleteAction && (
          <DeleteForm
            event={event}
            action={deleteAction}
            label={deleteLabel}
            onDone={onClose}
          />
        )}
        <ChangeLogSection entries={event.changeLog} />
      </div>
    </div>
  );
}

function ChangeForm({
  event,
  action,
  label,
  requestMode,
  onDone,
}: {
  event: CalendarEvent;
  action: FormAction;
  label: string;
  requestMode: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form
      action={formAction}
      className="space-y-2 border-t border-black/10 pt-3 dark:border-white/15"
    >
      <input type="hidden" name="schedule_id" value={event.scheduleId ?? event.id} />
      <input type="hidden" name="student_id" value={event.studentId ?? ""} />
      <label className="block text-sm">
        <span className="font-medium">새 시작 (KST)</span>
        <input
          type="datetime-local"
          name="starts_at"
          step={1800}
          defaultValue={isoToKstLocal(event.startsAt)}
          required
          className={input}
        />
      </label>
      <label className="block text-sm">
        <span className="font-medium">수업 시간</span>
        <DurationSelect
          defaultValue={
            event.endsAt
              ? snapDurationMinutes(
                (new Date(event.endsAt).getTime() -
                  new Date(event.startsAt).getTime()) /
                60_000,
              )
              : 60
          }
          className={input}
        />
      </label>
      {requestMode && <MessageBox />}
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background disabled:opacity-50"
      >
        {pending ? "처리 중…" : label}
      </button>
    </form>
  );
}

function MessageBox() {
  return (
    <label className="block text-sm">
      <span className="font-medium">요청 메시지</span>
      <textarea
        name="note"
        rows={2}
        placeholder="선생님께 보낼 메세지를 입력해주세요(선택)"
        className={`${input} resize-none`}
      />
    </label>
  );
}

function CancelForm({
  event,
  action,
  label,
  requestMode,
  onDone,
}: {
  event: CalendarEvent;
  action: FormAction;
  label: string;
  requestMode: boolean;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="schedule_id" value={event.scheduleId ?? event.id} />
      <input type="hidden" name="student_id" value={event.studentId ?? ""} />
      {requestMode && <MessageBox />}
      {state.error && <p className="mb-2 text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-500/40 dark:hover:bg-red-950/30"
      >
        {pending ? "처리 중…" : label}
      </button>
    </form>
  );
}

/** 직접 정산(수령 완료) 토글 — 현금 등으로 이미 받은 추가/변경 수업료를 이월에서 제외. */
function SettleForm({
  event,
  action,
  onDone,
}: {
  event: CalendarEvent;
  action: FormAction;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form
      action={formAction}
      className="space-y-1 border-t border-black/10 pt-3 dark:border-white/15"
    >
      <input type="hidden" name="schedule_id" value={event.scheduleId ?? event.id} />
      <input type="hidden" name="settled" value={event.settled ? "0" : "1"} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className={`w-full rounded-md px-3 py-2 text-sm font-medium ${
          event.settled
            ? "border border-black/15 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            : "border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-500/40 dark:text-green-400 dark:hover:bg-green-950/30"
        } disabled:opacity-50`}
      >
        {pending
          ? "처리 중…"
          : event.settled
            ? "직접 수령 해제"
            : "수업료 수령 처리 (직접 정산)"}
      </button>
      <p className="text-center text-xs text-black/45 dark:text-white/45">
        {event.settled
          ? "직접 수령 처리됨 — 다음 달 이월에서 제외 중"
          : "현금 등으로 이미 받았다면 처리 → 다음 달 청구에서 제외"}
      </p>
    </form>
  );
}

/** 잘못 입력한 수업을 완전 삭제 (취소와 구분, 2단계 확인). 선생님 전용. */
function DeleteForm({
  event,
  action,
  label,
  onDone,
}: {
  event: CalendarEvent;
  action: FormAction;
  label: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  if (!confirming) {
    return (
      <div className="border-t border-black/10 pt-3 dark:border-white/15">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="w-full rounded-md px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
        >
          {label}
        </button>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="space-y-2 border-t border-black/10 pt-3 dark:border-white/15"
    >
      <input type="hidden" name="schedule_id" value={event.scheduleId ?? event.id} />
      <p className="text-xs text-red-600">
        이 수업을 영구 삭제합니다. 되돌릴 수 없고 정산에도 반영되지 않습니다.
      </p>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "삭제 중…" : "삭제 확인"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="flex-1 rounded-md border border-black/15 px-3 py-2 text-sm hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          아니오
        </button>
      </div>
    </form>
  );
}

/** 취소한 수업 되살리기 — 구분·정산은 서버(트리거)가 원래대로 재계산한다. */
function RestoreForm({
  event,
  action,
  onDone,
}: {
  event: CalendarEvent;
  action: FormAction;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  return (
    <form
      action={formAction}
      className="space-y-1 border-t border-black/10 pt-3 dark:border-white/15"
    >
      <input type="hidden" name="schedule_id" value={event.scheduleId ?? event.id} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        {pending ? "처리 중…" : "취소 해제 (수업 되살리기)"}
      </button>
      <p className="text-center text-xs text-black/45 dark:text-white/45">
        원래 시간에 다른 수업이 있으면 되살릴 수 없습니다
      </p>
    </form>
  );
}

/** 변경 롤백 — 최초 계획 시간으로 되돌린다. 되돌리면 '변경' 표시·정산 대상에서 빠진다. */
function RevertForm({
  event,
  action,
  onDone,
}: {
  event: CalendarEvent;
  action: FormAction;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {} as ActionState);
  useEffect(() => {
    if (state.ok) onDone();
  }, [state.ok, onDone]);

  const target = event.originStartsAt
    ? `${kstDateKey(event.originStartsAt)} ${kstTime(event.originStartsAt)}`
    : "";

  return (
    <form
      action={formAction}
      className="space-y-1 border-t border-black/10 pt-3 dark:border-white/15"
    >
      <input type="hidden" name="schedule_id" value={event.scheduleId ?? event.id} />
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md border border-black/15 px-3 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10"
      >
        {pending ? "처리 중…" : "변경 되돌리기 (최초 계획으로)"}
      </button>
      <p className="text-center text-xs text-black/45 dark:text-white/45">
        {target ? `${target} 로 복원 — '변경' 표시와 정산 대상에서 빠집니다` : ""}
      </p>
    </form>
  );
}

const LOG_LABEL: Record<ScheduleChangeKind, string> = {
  created: "등록",
  changed: "변경",
  reverted: "되돌림",
  cancelled: "취소",
  restored: "취소 해제",
  settled: "수업료 수령 처리",
  unsettled: "수령 처리 해제",
};

/** "MM/DD HH:MM~HH:MM" */
function logSlot(starts: string | null, ends: string | null): string {
  if (!starts) return "";
  const d = kstDateKey(starts).slice(5).replace("-", "/");
  return `${d} ${kstTime(starts)}${ends ? `~${kstTime(ends)}` : ""}`;
}

/** 변경 내역 — 접이식, 이력이 있을 때만. 노출 여부는 서버(SHOW_CHANGE_LOG)가 결정한다. */
function ChangeLogSection({ entries }: { entries?: ChangeLogEntry[] }) {
  if (!entries || entries.length === 0) return null;
  return (
    <details className="border-t border-black/10 pt-3 text-sm dark:border-white/15">
      <summary className="cursor-pointer text-black/60 dark:text-white/60">
        변경 내역 ({entries.length})
      </summary>
      <ul className="mt-2 space-y-1">
        {entries.map((e, i) => {
          const from = logSlot(e.fromStarts, e.fromEnds);
          const to = logSlot(e.toStarts, e.toEnds);
          return (
            <li key={i} className="text-xs text-black/60 dark:text-white/60">
              <span className="text-black/40 dark:text-white/40">
                {logSlot(e.changedAt, null)}
              </span>{" "}
              <span className="font-medium">{LOG_LABEL[e.kind]}</span>
              {from && to ? ` ${from} → ${to}` : to ? ` ${to}` : ""}
            </li>
          );
        })}
      </ul>
    </details>
  );
}
