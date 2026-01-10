"use client";

import { MouseEventHandler, ReactNode, useEffect, useRef, useState } from "react";
import clsx from "clsx";

type SwipeActionProps = {
  children: ReactNode;
  onDelete: () => Promise<void> | void;
  className?: string;
  actionLabel?: string;
  disabled?: boolean;
};

const ACTION_WIDTH = 96;

export default function SwipeAction({
  children,
  onDelete,
  className,
  actionLabel = "删除",
  disabled = false
}: SwipeActionProps) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const startXRef = useRef(0);
  const offsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const actionEnabled = !disabled;

  const setOffsetSafely = (value: number) => {
    offsetRef.current = value;
    setOffset(value);
  };

  const reset = () => {
    setOpen(false);
    setOffsetSafely(0);
  };

  const handleStart = (clientX: number) => {
    if (isDesktop || !actionEnabled) return;
    startXRef.current = clientX;
    isDraggingRef.current = false;
  };

  const handleMove = (clientX: number) => {
    if (isDesktop || !actionEnabled) return;
    const distance = Math.abs(clientX - startXRef.current);
    // Mark as dragging if moved more than 5px
    if (distance > 5) {
      isDraggingRef.current = true;
      const delta = Math.min(0, clientX - startXRef.current);
      const base = open ? delta - ACTION_WIDTH : delta;
      const clamped = Math.max(-ACTION_WIDTH, Math.min(base, 0));
      setOffsetSafely(clamped);
    }
  };

  const handleEnd = () => {
    if (isDesktop || !actionEnabled) return;
    if (isDraggingRef.current) {
      const currentOffset = offsetRef.current;
      const shouldOpen = currentOffset <= -ACTION_WIDTH * 0.35;
      setOpen(shouldOpen);
      setOffsetSafely(shouldOpen ? -ACTION_WIDTH : 0);
    }
  };

  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
    if (!actionEnabled) {
      return;
    }
    // If we just dragged, prevent the click
    if (isDraggingRef.current) {
      event.preventDefault();
      event.stopPropagation();
      isDraggingRef.current = false;
      return;
    }
    // If swipe is open, close it and prevent the click from propagating
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      reset();
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete();
      reset();
    } catch (error) {
      console.error("[swipe-delete] failed", error);
    }
  };

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (isDesktop || !actionEnabled) return;

    const onTouchStart = (event: TouchEvent) => {
      handleStart(event.touches[0].clientX);
    };

    const onTouchMove = (event: TouchEvent) => {
      handleMove(event.touches[0].clientX);
      const distance = Math.abs(event.touches[0].clientX - startXRef.current);
      if (distance > 8) {
        event.preventDefault();
      }
    };

    const onTouchEnd = () => {
      handleEnd();
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
    };
  }, [open, isDesktop, actionEnabled]);

  const showAction = actionEnabled && (open || offsetRef.current < 0);
  const translateX = isDesktop || !actionEnabled ? 0 : offset;

  return (
    <div className={clsx("relative overflow-hidden group", className)}>
      {actionEnabled && !isDesktop ? (
        <div
          className={clsx(
            "absolute inset-0 flex items-stretch justify-end bg-danger/5 transition-opacity duration-150",
            showAction ? "opacity-100" : "opacity-0 pointer-events-none"
          )}
        >
          <button
            type="button"
            className="m-1 flex w-[88px] items-center justify-center rounded-xl bg-danger text-white shadow-sm active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
            aria-label={actionLabel}
            onClick={handleDelete}
            tabIndex={showAction ? 0 : -1}
          >
            <span className="text-xs font-semibold">{actionLabel}</span>
          </button>
        </div>
      ) : null}
      <div
        ref={containerRef}
        className={clsx("relative touch-pan-y", actionEnabled ? "cursor-pointer" : "")}
        style={{
          transform: `translateX(${translateX}px)`,
          transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease"
        }}
        onMouseDown={(event) => handleStart(event.clientX)}
        onMouseMove={(event) => handleMove(event.clientX)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onClick={handleClick}
      >
        <div className={actionEnabled ? "lg:[&>*]:pr-16" : ""}>
          {children}
        </div>
        {actionEnabled ? (
          <button
            type="button"
            className="hidden lg:flex absolute right-4 top-4 h-8 w-8 items-center justify-center rounded-full bg-danger/10 text-danger hover:bg-danger/20 z-10"
            aria-label={actionLabel}
            onClick={(event) => {
              event.stopPropagation();
              handleDelete();
            }}
          >
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
