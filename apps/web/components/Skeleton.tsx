"use client";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-surface-2 rounded-xl ${className}`}
      aria-hidden="true"
    />
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface-0 p-4 shadow-card">
      <div className="flex items-start justify-between mb-2.5">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-6 w-6 rounded-lg" />
      </div>
      <Skeleton className="h-5 w-3/4 mb-3" />
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-16 rounded-full" />
        <Skeleton className="h-6 w-16 rounded-full" />
      </div>
    </div>
  );
}

export function ProjectListSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
