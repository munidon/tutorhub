// 월간 캘린더를 PNG 이미지로 그린다 (학부모 전달용).
// 화면을 캡처하는 대신 같은 이벤트 데이터로 캔버스에 다시 그린다 —
// 외부 라이브러리 없이 동작하고, 다크 모드·스크롤·잘림에 영향받지 않으며
// 항상 흰 배경의 또렷한 2배 해상도 결과를 얻는다.

import { kstDateKey, kstTime } from "./datetime";
import type { CalendarEvent } from "@/components/MonthCalendar";

const SCALE = 2; // 2배 해상도(레티나/카톡 전송 시 또렷하게)
const W = 1120; // 논리 폭(px)
const PAD = 28;
const TITLE_H = 74;
const DOW_H = 32;
const CELL_MIN_H = 96;
const DAY_NUM_H = 22;
const CHIP_H = 22;
const CHIP_GAP = 3;
const FOOTER_H = 34;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const FONT =
  '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';

const pad2 = (n: number) => String(n).padStart(2, "0");
const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT}`;

export type CalendarImageOptions = {
  events: CalendarEvent[];
  year: number;
  month: number;
  /** 칩에 학생 이름을 함께 표시(전체 학생 보기) */
  showName: boolean;
  /** 제목 아래 부제 — 보통 학생 이름 */
  subtitle?: string;
};

type Cell = {
  key: string;
  day: number;
  dow: number;
  inMonth: boolean;
  events: CalendarEvent[];
};

/** 표시 월의 셀 목록 — MonthCalendar 와 같은 규칙(앞뒤 달 채움) */
function buildCells(
  events: CalendarEvent[],
  year: number,
  month: number,
): Cell[] {
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const key = kstDateKey(e.startsAt);
    const arr = byDay.get(key);
    if (arr) arr.push(e);
    else byDay.set(key, [e]);
  }
  for (const arr of byDay.values()) {
    arr.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  const firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((firstDow + daysInMonth) / 7) * 7;

  return Array.from({ length: totalCells }, (_, i) => {
    const date = new Date(Date.UTC(year, month - 1, i - firstDow + 1));
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const key = `${y}-${pad2(m)}-${pad2(d)}`;
    return {
      key,
      day: d,
      dow: date.getUTCDay(),
      inMonth: m === month && y === year,
      events: byDay.get(key) ?? [],
    };
  });
}

/** 폭에 맞게 자르고 넘치면 말줄임표 */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo)}…` : "";
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

/** 칩 라벨: "14:00~17:00 홍길동 (변경)" */
function chipLabel(e: CalendarEvent, showName: boolean): string {
  const time = e.endsAt
    ? `${kstTime(e.startsAt)}~${kstTime(e.endsAt)}`
    : kstTime(e.startsAt);
  const name = showName && e.title ? ` ${e.title}` : "";
  const tag = e.tag ? ` (${e.tag})` : "";
  return `${time}${name}${tag}`;
}

/** 해당 월 확정 수업의 횟수·총 시간 */
function summarize(cells: Cell[]) {
  let count = 0;
  let minutes = 0;
  for (const cell of cells) {
    if (!cell.inMonth) continue;
    for (const e of cell.events) {
      if (e.pending || e.status !== "confirmed") continue;
      count += 1;
      if (e.endsAt) {
        minutes +=
          (new Date(e.endsAt).getTime() - new Date(e.startsAt).getTime()) /
          60_000;
      }
    }
  }
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const hours = m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
  return { count, hours };
}

/** 월간 캘린더 PNG 를 만든다. 브라우저에서만 호출 가능. */
export async function renderCalendarPng({
  events,
  year,
  month,
  showName,
  subtitle,
}: CalendarImageOptions): Promise<Blob> {
  const cells = buildCells(events, year, month);
  const weeks = cells.length / 7;
  const gridW = W - PAD * 2;
  const colW = gridW / 7;

  // 주별 높이 — 그 주에서 가장 많은 칩 수에 맞춘다
  const rowH: number[] = [];
  for (let w = 0; w < weeks; w++) {
    const maxChips = Math.max(
      ...cells.slice(w * 7, w * 7 + 7).map((c) => c.events.length),
    );
    rowH.push(
      Math.max(CELL_MIN_H, DAY_NUM_H + 8 + maxChips * (CHIP_H + CHIP_GAP)),
    );
  }
  const gridH = rowH.reduce((a, b) => a + b, 0);
  const H = PAD + TITLE_H + DOW_H + gridH + FOOTER_H + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W * SCALE;
  canvas.height = Math.round(H * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 만들 수 없습니다.");
  ctx.scale(SCALE, SCALE);
  ctx.textBaseline = "top";

  // 배경 — 다크 모드와 무관하게 항상 흰색
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // 제목
  ctx.fillStyle = "#111111";
  ctx.font = font(30, 700);
  ctx.fillText(`${year}년 ${month}월 수업 일정`, PAD, PAD + 2);
  if (subtitle) {
    ctx.fillStyle = "#6b7280";
    ctx.font = font(17, 500);
    ctx.fillText(subtitle, PAD, PAD + 40);
  }

  // 요일 머리글
  const dowY = PAD + TITLE_H;
  ctx.font = font(14, 600);
  ctx.textAlign = "center";
  WEEKDAYS.forEach((label, i) => {
    ctx.fillStyle =
      i === 0 ? "#ef4444" : i === 6 ? "#3b82f6" : "#6b7280";
    ctx.fillText(label, PAD + colW * i + colW / 2, dowY + 8);
  });
  ctx.textAlign = "left";

  // 그리드
  const gridY = dowY + DOW_H;
  ctx.fillStyle = "#fafafa";
  ctx.fillRect(PAD, gridY, gridW, gridH);

  const todayKey = kstDateKey(new Date().toISOString());
  let y = gridY;
  for (let w = 0; w < weeks; w++) {
    const h = rowH[w];
    for (let i = 0; i < 7; i++) {
      const cell = cells[w * 7 + i];
      const x = PAD + colW * i;

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, colW, h);
      ctx.globalAlpha = cell.inMonth ? 1 : 0.4;

      // 날짜 숫자 (오늘은 반전 배지)
      const numX = x + colW - 8;
      const numY = y + 6;
      ctx.font = font(13, cell.key === todayKey ? 700 : 500);
      if (cell.key === todayKey) {
        const tw = ctx.measureText(String(cell.day)).width;
        ctx.fillStyle = "#111111";
        roundRect(ctx, numX - tw - 6, numY - 3, tw + 12, 20, 4);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
      } else {
        ctx.fillStyle =
          cell.dow === 0 ? "#ef4444" : cell.dow === 6 ? "#3b82f6" : "#374151";
      }
      ctx.textAlign = "right";
      ctx.fillText(String(cell.day), numX, numY);
      ctx.textAlign = "left";

      // 수업 칩
      let cy = y + DAY_NUM_H + 4;
      for (const e of cell.events) {
        const cx = x + 4;
        const cw = colW - 8;
        const cancelled = e.status === "cancelled";

        if (e.pending) {
          ctx.save();
          ctx.setLineDash([3, 2]);
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 1;
          roundRect(ctx, cx + 0.5, cy + 0.5, cw - 1, CHIP_H - 1, 3);
          ctx.stroke();
          ctx.restore();
        } else {
          ctx.fillStyle = "#f4f4f5";
          roundRect(ctx, cx, cy, cw, CHIP_H, 3);
          ctx.fill();
          ctx.fillStyle = e.color; // 왼쪽 색 막대 = 학생 구분
          ctx.fillRect(cx, cy, 3, CHIP_H);
        }

        const textX = cx + (e.pending ? 5 : 7);
        const textW = cw - (e.pending ? 10 : 12);
        ctx.font = font(12, 500);
        const label = fit(ctx, chipLabel(e, showName), textW);
        ctx.fillStyle = cancelled ? "#9ca3af" : "#111827";
        ctx.fillText(label, textX, cy + 5);
        if (cancelled) {
          const lw = ctx.measureText(label).width;
          ctx.strokeStyle = "#9ca3af";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(textX, cy + CHIP_H / 2 + 0.5);
          ctx.lineTo(textX + lw, cy + CHIP_H / 2 + 0.5);
          ctx.stroke();
        }
        cy += CHIP_H + CHIP_GAP;
      }
      ctx.globalAlpha = 1;
    }
    y += h;
  }

  // 그리드 선
  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  let ly = gridY;
  for (let w = 0; w <= weeks; w++) {
    ctx.moveTo(PAD, ly + 0.5);
    ctx.lineTo(PAD + gridW, ly + 0.5);
    if (w < weeks) ly += rowH[w];
  }
  for (let i = 0; i <= 7; i++) {
    const lx = Math.round(PAD + colW * i) + 0.5;
    ctx.moveTo(lx, gridY);
    ctx.lineTo(lx, gridY + gridH);
  }
  ctx.stroke();

  // 요약 + 생성 시각
  const { count, hours } = summarize(cells);
  const footY = gridY + gridH + 11;
  ctx.font = font(14, 600);
  ctx.fillStyle = "#374151";
  ctx.fillText(`총 ${count}회 · ${hours}`, PAD, footY);
  ctx.font = font(12, 400);
  ctx.fillStyle = "#9ca3af";
  ctx.textAlign = "right";
  ctx.fillText(
    `${kstDateKey(new Date().toISOString())} 기준`,
    W - PAD,
    footY + 2,
  );
  ctx.textAlign = "left";

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("이미지 생성에 실패했습니다.")),
      "image/png",
    );
  });
}
