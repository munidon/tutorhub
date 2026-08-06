/** 라우트 전환 중 표시되는 스켈레톤 — 각 페이지 형태를 근사해 레이아웃 점프 방지 */

function Bar({ className }: { className: string }) {
  return <div className={`rounded bg-black/10 dark:bg-white/10 ${className}`} />;
}

/** 캘린더 페이지: 제목 + 월 내비 + 7열 그리드 */
export function CalendarSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <Bar className="h-8 w-40" />
      <Bar className="h-10 w-full" />
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 35 }).map((_, i) => (
          <div
            key={i}
            className="h-20 rounded-sm bg-black/5 sm:h-24 dark:bg-white/5"
          />
        ))}
      </div>
    </div>
  );
}

/** 목록형 페이지(요청 내역, 학생/계정, 정산): 제목 + 행 반복 */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4">
      <Bar className="h-8 w-40" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="h-16 rounded-lg bg-black/5 dark:bg-white/5"
          />
        ))}
      </div>
    </div>
  );
}

/** 설정형 페이지: 제목 + 폼 블록 */
export function FormSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <Bar className="h-8 w-40" />
      <div className="h-48 rounded-lg bg-black/5 dark:bg-white/5" />
      <div className="h-32 rounded-lg bg-black/5 dark:bg-white/5" />
    </div>
  );
}
