export default function RootLoading() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 text-muted">
      <svg
        className="size-5 animate-spin"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeWidth="3"
        />
        <path
          d="M22 12a10 10 0 0 0-10-10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-sm">Loading…</p>
    </div>
  );
}
