"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ContactUsModal } from "@/components/landing/ContactUsModal";
import { LandingAuthLink, LandingHeroPrimaryCta } from "@/components/stitch/LandingAuthCta";

export function LandingNav() {
  const [elevated, setElevated] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setElevated(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed top-4 left-0 right-0 z-50 flex justify-center px-4 transition-all duration-300">
      <div
        className={`w-full max-w-5xl rounded-[34px] px-8 py-3 flex items-center justify-between transition-all duration-400 ${
          elevated
            ? "border border-slate-300/80 bg-white/90 shadow-xl backdrop-blur-2xl"
            : "border border-slate-200/60 bg-white/75 shadow-sm backdrop-blur-xl"
        }`}
        style={{
          boxShadow: "0 2px 24px rgba(0, 0, 0, 0.02), inset 0 1px 3px rgba(0, 0, 0, 0.04)",
        }}
      >
        <Link href="/" className="flex items-center gap-2.5 group">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo_with_text_with_shield.png"
            alt="Vrika"
            className="h-9 md:h-10 w-auto object-contain transition-transform group-hover:scale-105"
          />
        </Link>

        <nav className="hidden items-center gap-8 text-[11px] font-semibold uppercase tracking-[1px] md:flex text-[#1e2033]">
          <a href="#demo" className="transition-colors hover:text-[#6366f1]">
            Platform
          </a>
          <a href="#pulse" className="transition-colors hover:text-[#6366f1]">
            Developers
          </a>
          <LandingAuthLink
            href="/login"
            signedInHref="/tools"
            className="transition-colors hover:text-[#6366f1]"
          >
            Resources
          </LandingAuthLink>
          <a href="#faq" className="transition-colors hover:text-[#6366f1]">
            Company
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <LandingHeroPrimaryCta
            className="rounded-full bg-[#1e2033] px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-white shadow-md transition-all hover:bg-[#3a3f5c] hover:scale-[1.02]"
          />
          <button
            type="button"
            onClick={() => setContactOpen(true)}
            className="rounded-full bg-gradient-to-b from-white to-[#f0f1f5] border border-[#1e2033]/15 px-6 py-2.5 text-xs font-semibold uppercase tracking-wider text-[#1e2033] shadow-sm transition-all hover:bg-[#e2e8f0]"
          >
            Contact Us
          </button>
        </div>
      </div>
      <ContactUsModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </header>
  );
}



