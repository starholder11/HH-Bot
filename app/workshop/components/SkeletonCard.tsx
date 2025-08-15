"use client";

export default function SkeletonCard() {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden animate-pulse">
      <div className="p-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-12 h-4 bg-neutral-700 rounded"></div>
            <div className="w-8 h-3 bg-neutral-700 rounded"></div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-neutral-700 rounded"></div>
            <div className="w-5 h-5 bg-neutral-700 rounded"></div>
          </div>
        </div>
        <div className="mt-2 w-3/4 h-4 bg-neutral-700 rounded"></div>
      </div>
      <div className="px-3">
        <div className="w-full h-40 bg-neutral-700 rounded-md"></div>
      </div>
      <div className="p-3 h-24 flex flex-col justify-between">
        <div className="flex-1">
          <div className="w-full h-3 bg-neutral-700 rounded mb-2"></div>
          <div className="w-2/3 h-3 bg-neutral-700 rounded"></div>
        </div>
        <div className="mt-2 flex gap-1">
          <div className="w-12 h-5 bg-neutral-700 rounded-full"></div>
          <div className="w-16 h-5 bg-neutral-700 rounded-full"></div>
          <div className="w-10 h-5 bg-neutral-700 rounded-full"></div>
        </div>
      </div>
    </div>
  );
}
