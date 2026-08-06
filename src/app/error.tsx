"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 p-8 text-center">
      <p className="text-lg font-semibold">문제가 발생했습니다</p>
      <p className="text-sm text-black/60 dark:text-white/60">
        일시적인 오류일 수 있습니다. 다시 시도해 주세요.
      </p>
      <button
        onClick={reset}
        className="rounded-md bg-black px-4 py-2 text-sm text-white dark:bg-white dark:text-black"
      >
        다시 시도
      </button>
    </div>
  );
}
