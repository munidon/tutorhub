"use client";

import { useState } from "react";

/** 선생님 정산 카드 하단: 전월 이월(취소 등) 안내 문구 생성 → 확인·수정 후 복사 */
export function CarryNoticeButton({ notice }: { notice: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(notice);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한 거부 등 — 조용히 무시
    }
  }

  const btn =
    "rounded-md border border-black/15 px-2 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10";

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={btn}
        aria-expanded={open}
      >
        {open ? "안내 문구 닫기" : "이월 안내 문구 생성"}
      </button>
      {open && (
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(16, text.split("\n").length + 1)}
            className="w-full rounded-md border border-black/15 px-3 py-2 text-sm dark:border-white/20 dark:bg-transparent"
          />
          <button type="button" onClick={copy} className={btn}>
            {copied ? "복사됨!" : "문구 복사"}
          </button>
        </div>
      )}
    </div>
  );
}
