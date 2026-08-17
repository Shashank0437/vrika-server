import type { ReactNode } from "react";
import { AuthMarketingPanel } from "./AuthMarketingPanel";

type AuthSplitLayoutProps = {
  children: ReactNode;
};

/** Sarvam AI light frosted split layout — marketing left, clean form column right. */
export function AuthSplitLayout({ children }: AuthSplitLayoutProps) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-[#fafafa] font-sans text-[#1e2033] lg:flex-row overflow-x-hidden">
      {/* Top Soft Blue Aura */}
      <div
        className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[1200px] h-[400px] opacity-60 blur-[80px]"
        style={{
          background: "radial-gradient(ellipse at 50% 0%, #A5BBFC 0%, #D5E2FF 40%, transparent 75%)",
        }}
        aria-hidden="true"
      />

      <AuthMarketingPanel />
      <section className="relative z-10 flex flex-1 flex-col justify-center px-6 py-12 sm:px-10 lg:px-16 xl:px-20">{children}</section>
    </div>
  );
}


