"use client";

import { MouseEventHandler, ReactNode, useEffect, useRef, useState } from "react";
import clsx from "clsx";

type SwipeActionProps = {
  children: ReactNode;
  onDelete: () => Promise<void> | void;
  className?: string;
  actionLabel?: string;
};

const ACTION_WIDTH = 96;

export default function SwipeAction({
  children,
  onDelete,
  className,
  actionLabel = "删除"
}: SwipeActionProps) {
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState(false);
  const startXRef = useRef(0);
  const offsetRef = useRef(0);
  const isDraggingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const setOffsetSafely = (value: number) => {
    offsetRef.current = value;
    setOffset(value);
  };

  const reset = () => {
    setOpen(false);
    setOffsetSafely(0);
  };

  const handleStart = (clientX: number) => {
    startXRef.current = clientX;
    isDraggingRef.current = false;
  };

  const handleMove = (clientX: number) => {
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
    if (isDraggingRef.current) {
      const currentOffset = offsetRef.current;
      const shouldOpen = currentOffset <= -ACTION_WIDTH * 0.35;
      setOpen(shouldOpen);
      setOffsetSafely(shouldOpen ? -ACTION_WIDTH : 0);
    }
  };

  const handleClick: MouseEventHandler<HTMLDivElement> = (event) => {
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
    const container = containerRef.current;
    if (!container) return;

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
  }, [open]);

  const showAction = open || offsetRef.current < 0;

  return (
    <div className={clsx("relative overflow-hidden", className)}>
      <div
        className={clsx(
          "absolute inset-0 flex items-stretch justify-end bg-danger/5 transition-opacity duration-150",
          showAction ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        <button
          type="button"
          className="m-1 flex w-[88px] items-center justify-center rounded-xl bg-danger text-xs font-semibold text-white shadow-sm active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2"
          aria-label={actionLabel}
          onClick={handleDelete}
          tabIndex={showAction ? 0 : -1}
        >
          {actionLabel}
        </button>
      </div>
      <div
        ref={containerRef}
        className="relative touch-pan-y"
        style={{
          transform: `translateX(${offset}px)`,
          transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease"
        }}
        onMouseDown={(event) => handleStart(event.clientX)}
        onMouseMove={(event) => handleMove(event.clientX)}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onClick={handleClick}
      >
        {children}
      </div>
    </div>
  );
}
