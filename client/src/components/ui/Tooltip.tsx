"use client";

import React, { useState } from "react";

interface TooltipProps {
  content: string;
  children: React.ReactNode;
}

export function Tooltip({ content, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);

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
        <div className="absolute bottom-full mb-2.5 z-[9999] pointer-events-none">
          <div className="relative rounded-lg bg-[#2D2D2D] px-2.5 py-1.5 text-[11px] font-bold text-white shadow-xl ring-1 ring-white/10 whitespace-nowrap animate-in fade-in zoom-in duration-150 origin-bottom">
            {content}
            <div className="absolute top-[95%] left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-[#2D2D2D]" />
          </div>
        </div>
      )}
    </div>
  );
}
