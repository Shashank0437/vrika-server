"use client";

import React, { useState } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  align?: "center" | "right" | "left";
}

export function Tooltip({ content, children, align = "center" }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  // Position the tooltip container
  const positionClass =
    align === "center"
      ? "left-1/2 -translate-x-1/2"
      : align === "right"
        ? "right-0"
        : "left-0";

  // Position the arrow
  const arrowClass =
    align === "center"
      ? "left-1/2 -translate-x-1/2"
      : align === "right"
        ? "right-2.5"
        : "left-2.5";

  return (
    <div
      className="relative flex items-center justify-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div className={`absolute bottom-full mb-2 z-[9999] pointer-events-none ${positionClass}`}>
          <div className="relative rounded-lg bg-[#1A1A1A] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-2xl ring-1 ring-white/10 whitespace-nowrap animate-in fade-in zoom-in duration-150 origin-bottom">
            {content}
            <div className={`absolute top-full border-[5px] border-transparent border-t-[#1A1A1A] ${arrowClass}`} />
          </div>
        </div>
      )}
    </div>
  );
}
