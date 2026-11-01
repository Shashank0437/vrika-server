"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Apple, Bot, ChevronDown, Cpu, Smartphone } from "lucide-react";
import { MOBILE_SECURITY_HREF } from "@/lib/mobile-security-nav";
import { card, EngineStatusBanner, PageHeader, primaryButton } from "@/components/mobile-security/ui";

function AnalyzerCard({ icon, title, description, accent, children }: { icon: React.ReactNode; title: string; description: string; accent: string; children: React.ReactNode }) {
  return (
    <div className={`${card} relative flex flex-col items-center gap-4 overflow-visible p-8 text-center`}>
      <span className={`flex size-20 items-center justify-center rounded-3xl ${accent}`}>{icon}</span>
      <div>
        <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
      </div>
      {children}
    </div>
  );
}

function IosMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  return (
    <div ref={ref} className="relative">
      <button className={primaryButton} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        iOS Dynamic Analyzer <ChevronDown className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute left-1/2 z-20 mt-2 w-64 -translate-x-1/2 overflow-hidden rounded-xl border border-outline-variant/70 bg-surface-container-lowest text-left shadow-xl">
          <Link role="menuitem" href={`${MOBILE_SECURITY_HREF}/dynamic/ios/corellium`} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-container">
            <Cpu className="mt-0.5 size-4 text-primary" />
            <span>
              <span className="block text-sm font-semibold text-on-surface">Corellium virtual device</span>
              <span className="block text-xs text-on-surface-variant">Cloud iOS instances</span>
            </span>
          </Link>
          <Link role="menuitem" href={`${MOBILE_SECURITY_HREF}/dynamic/ios/device`} className="flex items-start gap-3 border-t border-outline-variant/50 px-4 py-3 hover:bg-surface-container">
            <Smartphone className="mt-0.5 size-4 text-primary" />
            <span>
              <span className="block text-sm font-semibold text-on-surface">Jailbroken device</span>
              <span className="block text-xs text-on-surface-variant">Physical iPhone over SSH</span>
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function DynamicAnalysisLandingPage() {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <PageHeader
        eyebrow="Mobile Security / Dynamic Analysis"
        title="Dynamic Analysis"
        description="Run apps on a real or virtual device to observe runtime behaviour, traffic, storage and API usage, and instrument them with Frida."
      />
      <EngineStatusBanner />
      <div className="mx-auto grid max-w-3xl gap-5 md:grid-cols-2">
        <AnalyzerCard
          icon={<Bot className="size-10" />}
          title="Android Dynamic Analyzer"
          description="Perform dynamic analysis of Android applications."
          accent="bg-gradient-to-br from-tertiary-container/70 to-tertiary-container/30 text-tertiary"
        >
          <Link href={`${MOBILE_SECURITY_HREF}/dynamic/android`} className={primaryButton}>
            Android Dynamic Analyzer
          </Link>
        </AnalyzerCard>
        <AnalyzerCard
          icon={<Apple className="size-10" />}
          title="iOS Dynamic Analyzer"
          description="Perform dynamic analysis of iOS applications."
          accent="bg-gradient-to-br from-surface-container-highest to-surface-container text-on-surface"
        >
          <IosMenu />
        </AnalyzerCard>
      </div>
    </section>
  );
}
