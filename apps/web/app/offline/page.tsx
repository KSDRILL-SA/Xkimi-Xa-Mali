export default function OfflinePage() {
  return (
    <div className="min-h-dvh bg-xxm-green flex flex-col items-center justify-center px-6 text-center">
      <div className="max-w-sm space-y-6">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
          <svg
            className="w-10 h-10 text-white"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 3l18 18M8.111 8.111A7 7 0 0115.89 15.89M14.828 9.172A4 4 0 019.172 14.828M2.457 6.54A11.955 11.955 0 013 12c0 5.523 4.477 10 10 10a11.955 11.955 0 005.46-.543M6.22 6.22A10 10 0 0119.78 19.78"
            />
          </svg>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-white">You're offline</h1>
          <p className="text-white/70 text-sm leading-relaxed">
            No internet connection detected. Please check your network and try again.
          </p>
        </div>

        {/* Retry button */}
        <button
          onClick={() => window.location.reload()}
          className="w-full rounded-xl bg-white text-xxm-green font-semibold py-3 px-6 hover:bg-white/90 transition-colors"
        >
          Try again
        </button>

        <p className="text-white/40 text-xs">Xkimm Xa Mali · Blessed is the hand that giveth.</p>
      </div>
    </div>
  )
}
