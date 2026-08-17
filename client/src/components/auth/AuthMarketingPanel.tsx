import Link from "next/link";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";

const BENEFITS = [
  {
    title: "Mesh-native orchestration",
    body: "Specialized agents share telemetry across recon, chaining, and reporting—not brittle one-off scripts.",
  },
  {
    title: "Evidence you can defend",
    body: "Raw transcripts, tool output, and artefacts on one timeline for red leads, reviewers, and blue partners.",
  },
  {
    title: "Human gates before impact",
    body: "Policy rails and explicit approvals before anything irreversible leaves quarantine.",
  },
];

export function AuthMarketingPanel() {
  return (
    <aside className="relative flex min-h-[min(48vh,440px)] flex-col justify-between overflow-hidden border-b border-slate-200/80 bg-white/75 backdrop-blur-2xl px-8 py-10 text-[#1e2033] lg:sticky lg:top-0 lg:h-dvh lg:min-h-0 lg:w-[min(100%,480px)] lg:shrink-0 lg:border-b-0 lg:border-r lg:border-slate-200/80 lg:px-12 lg:py-14 shadow-sm">
      <div className="relative">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo_with_text_with_shield.png"
            alt="Vrika"
            className="h-10 w-auto object-contain"
          />
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#3b82f6] bg-[#3b82f6]/10 border border-[#3b82f6]/20 px-2.5 py-0.5 rounded-full">
            Console Access
          </span>
        </div>

        <h2 className="mt-8 max-w-sm text-3xl font-extrabold leading-[1.15] tracking-tight text-[#1e2033] lg:text-[2rem]">
          Offensive security, <span className="bg-gradient-to-r from-[#3b82f6] to-[#6366f1] bg-clip-text text-transparent">orchestrated.</span>
        </h2>
        <p className="mt-4 max-w-sm text-sm leading-relaxed text-[#475569]">
          One sovereign workspace for coordinated AI agents, auditable evidence, and operator control—built for sanctioned security operations.
        </p>

        <ul className="mt-10 space-y-6">
          {BENEFITS.map((item) => (
            <li key={item.title} className="flex gap-4">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#3b82f6]/10 border border-[#3b82f6]/20 text-[#3b82f6]">
                <MaterialSymbol name="check_circle" filled className="text-lg" />
              </span>
              <div>
                <p className="font-semibold text-[#1e2033]">{item.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-[#64748b]">{item.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mt-12 border-t border-slate-200/80 pt-8 lg:mt-0">
        <p className="text-[11px] leading-relaxed text-[#64748b]">
          Use only in environments you legally control. Vrika is for authorized security testing—not unauthorized access.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[#3b82f6] transition-colors hover:text-[#2563eb]"
        >
          <MaterialSymbol name="arrow_back" className="text-base" />
          Back to website
        </Link>
      </div>
    </aside>
  );
}


