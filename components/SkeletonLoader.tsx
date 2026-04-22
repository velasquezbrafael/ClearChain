'use client';

interface SkeletonLoaderProps {
  step: number;
  steps: string[];
}

function Shimmer({ className }: { className: string }) {
  return (
    <div className={`bg-[#1a1a24] animate-pulse rounded-lg ${className}`} />
  );
}

export default function SkeletonLoader({ step, steps }: SkeletonLoaderProps) {
  return (
    <div className="space-y-6">
      {/* Progress steps */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {steps.map((label, i) => (
          <div
            key={label}
            className={`flex items-center gap-2 text-xs font-mono transition-colors duration-300 ${
              i < step ? 'text-[#00ff88]' : i === step ? 'text-gray-300' : 'text-gray-700'
            }`}
          >
            {i < step ? (
              <span className="w-4 h-4 rounded-full bg-[#00ff88] flex items-center justify-center text-black text-[9px] font-black flex-shrink-0">
                ✓
              </span>
            ) : i === step ? (
              <span className="w-4 h-4 rounded-full border-2 border-[#00ff88] border-t-transparent animate-spin flex-shrink-0" />
            ) : (
              <span className="w-4 h-4 rounded-full border border-gray-700 flex-shrink-0" />
            )}
            {label}
          </div>
        ))}
      </div>

      {/* Two-column skeleton: score card + graph */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Score card skeleton */}
        <div className="bg-[#0d0d14] border border-[#1a1a24] rounded-2xl p-6 space-y-5">
          <Shimmer className="h-3 w-24" />
          <div className="flex items-center gap-6">
            <Shimmer className="w-36 h-36 rounded-full flex-shrink-0" />
            <div className="space-y-3 flex-1">
              <Shimmer className="h-7 w-32" />
              <Shimmer className="h-4 w-full" />
              <Shimmer className="h-4 w-4/5" />
              <Shimmer className="h-4 w-3/5" />
            </div>
          </div>
          <Shimmer className="h-3 w-28 mt-2" />
          <div className="space-y-2">
            <Shimmer className="h-9 w-full" />
            <Shimmer className="h-9 w-full" />
            <Shimmer className="h-9 w-full" />
            <Shimmer className="h-9 w-full" />
          </div>
        </div>

        {/* Graph skeleton */}
        <div className="bg-[#0d0d14] border border-[#1a1a24] rounded-2xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#1a1a24] flex items-center gap-3">
            <Shimmer className="h-4 w-36" />
          </div>
          <div className="relative" style={{ minHeight: 420 }}>
            <Shimmer className="absolute inset-0 rounded-none" />
            {/* Fake nodes */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-64 h-64">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/20 animate-pulse" />
                <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-[#1a1a24] animate-pulse" />
                <div className="absolute top-4 right-4 w-6 h-6 rounded-full bg-[#1a1a24] animate-pulse" style={{ animationDelay: '0.2s' }} />
                <div className="absolute bottom-4 left-8 w-7 h-7 rounded-full bg-[#1a1a24] animate-pulse" style={{ animationDelay: '0.4s' }} />
                <div className="absolute bottom-4 right-8 w-5 h-5 rounded-full bg-[#1a1a24] animate-pulse" style={{ animationDelay: '0.6s' }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Below-fold skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Shimmer className="h-52" />
        <Shimmer className="h-52" />
      </div>
      <Shimmer className="h-48" />
      <Shimmer className="h-56" />
    </div>
  );
}
