"use client";

import { useState } from "react";

/** 계좌번호만 클립보드에 복사 (눌렀을 때 잠깐 '복사됨!' 표시) */
export function CopyAccountButton({ account }: { account: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 클립보드 권한 거부 등 — 조용히 무시
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-md border border-black/15 px-2 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
    >
      {copied ? "복사됨!" : "계좌번호 복사"}
    </button>
  );
}
