"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { FAQ_ITEMS } from "@/components/landing/landing-data";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingAuthLink, LandingHeroPrimaryCta } from "@/components/stitch/LandingAuthCta";
import { MaterialSymbol } from "@/components/ui/MaterialSymbol";
import { FOOTER_PLATFORM_LINKS, FOOTER_RESOURCE_LINKS } from "@/lib/coming-soon-routes";
import {
  SarvamFlourishSVG,
  CornerBlobSVG,
  SarvamMissionArchSVG,
  PillarAgentsHeaderSVG,
  PillarModelsHeaderSVG,
  PillarInfraHeaderSVG,
} from "@/components/stitch/SarvamGraphics";

const TOOL_CHIPS: { icon: string; label: string }[] = [
  { icon: "search", label: "NMAP" },
  { icon: "database", label: "SQLMAP" },
  { icon: "shield", label: "METASPLOIT" },
  { icon: "wifi", label: "AIRCRACK-NG" },
  { icon: "key", label: "JOHN" },
  { icon: "language", label: "BURPSUITE" },
  { icon: "lan", label: "WIRESHARK" },
];

const FOOTER_COPYRIGHT = "© 2026 Vrika. All rights reserved.";

const FOOTER_LEGAL_LINKS = [
  { href: "/terms-of-use", label: "Terms of Use" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/security-disclosure", label: "Security Disclosure" },
  { href: "/responsible-disclosure", label: "Responsible Disclosure" },
] as const;

function ToolMarqueeRow({ rowKey }: { rowKey: string }) {
  return (
    <>
      {TOOL_CHIPS.map((t) => (
        <div
          key={`${rowKey}-${t.label}`}
          className="flex shrink-0 cursor-default items-center gap-3 rounded-full border border-slate-200/80 bg-white px-6 py-3 transition-all hover:border-[#3b82f6]/50 hover:shadow-md shadow-sm"
        >
          <MaterialSymbol name={t.icon} className="shrink-0 text-xl text-[#3b82f6]" />
          <span className="font-bold tracking-tight text-[#1e2033] text-sm">{t.label}</span>
        </div>
      ))}
    </>
  );
}


/* API Capability Cards Data */
const API_CARDS = [
  {
    icon: "shield",
    title: "Mesh Orchestration",
    desc: "Coordinate agent clusters across recon, chaining, and exploitation",
    blob: "cloud" as const,
    badgeColor: "bg-[#3b82f6]/10 text-[#3b82f6]",
  },
  {
    icon: "folder",
    title: "Evidence Fabric",
    desc: "Immutable timelines tying transcripts and artefacts",
    blob: "petal" as const,
    badgeColor: "bg-rose-50 text-rose-600",
  },
  {
    icon: "lock",
    title: "Policy Gates",
    desc: "Enforce approvals before payloads leave quarantine",
    blob: "mandala" as const,
    badgeColor: "bg-purple-50 text-purple-600",
  },
  {
    icon: "trending_up",
    title: "CVE Correlation",
    desc: "Fuse scanner output with vendor advisories in real-time",
    blob: "flower" as const,
    badgeColor: "bg-pink-50 text-pink-600",
  },
];

export function StitchLandingPage() {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  return (
    <div className="bg-white font-sans text-slate-800 antialiased selection:bg-[#3b82f6]/20 selection:text-[#1e2033]">
      <LandingNav />

      <main>
        {/* Section 1: Hero */}
        <section className="relative isolate overflow-hidden bg-gradient-to-b from-[#fdf4ff] via-[#faf5ff] to-white pt-40 pb-24 text-[#1e2033]">
          {/* Top Vibrant Purple, Pink & Blue Radial Aura Spotlight */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-full max-w-[1600px] h-[650px] blur-[75px]"
            style={{
              background:
                "radial-gradient(ellipse 85% 55% at 50% 0%, #c084fc 0%, #f472b6 32%, #60a5fa 68%, transparent 88%)",
            }}
          />


          <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center text-center px-6">
            <SarvamFlourishSVG />

            {/* Subtitle Tag with Horizontal Glow Lines */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="flex items-center gap-4 mb-6"
            >
              <div className="h-px w-16 sm:w-24 bg-gradient-to-r from-transparent to-[#6a88e2]" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#3b82f6]">
                GenAI-Native Offensive Fabric
              </span>
              <div className="h-px w-16 sm:w-24 bg-gradient-to-l from-transparent to-[#6a88e2]" />
            </motion.div>

            {/* Main Serif Display Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 }}
              className="font-serif-sarvam text-5xl md:text-7xl font-normal leading-[1.08] tracking-tight text-[#1e2033] mb-6 max-w-3xl"
            >
              Plan, chain, and evolve autonomous red ops
            </motion.h1>

            {/* Subtext */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.4 }}
              className="text-lg md:text-xl text-slate-600 max-w-2xl leading-relaxed mb-8 font-sans-sarvam"
            >
              Twelve specialized agents orchestrate 147+ security tools using natural language directives.
              <br className="hidden sm:inline" /> Delivering population-scale security impact.
            </motion.p>

            {/* Partner / Tool Marquee Label */}
            <p className="text-xs font-bold uppercase tracking-[2px] text-slate-400 mt-4 mb-8">
              Sovereign Security Built With Vrika
            </p>
          </div>

          {/* Marquee Strip */}
          <div className="stitch-marquee-container relative py-4 overflow-hidden flex">
            <div className="absolute inset-y-0 left-0 z-10 w-32 bg-gradient-to-r from-white to-transparent pointer-events-none" />
            <div className="absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-white to-transparent pointer-events-none" />
            <div className="stitch-marquee-content flex gap-6 px-4 animate-[marquee_30s_linear_infinite]">
              <ToolMarqueeRow rowKey="hero-a" />
              <ToolMarqueeRow rowKey="hero-b" />
              <ToolMarqueeRow rowKey="hero-c" />
              <ToolMarqueeRow rowKey="hero-d" />
            </div>
          </div>
        </section>

        {/* Section 2: API / Product Grid (Clean Static Parity) */}
        <section className="border-t border-slate-200/80 bg-[#f8fafc] py-24">
          <div className="mx-auto max-w-7xl px-6">
            <motion.div
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <h2 className="font-serif-sarvam text-4xl md:text-5xl font-normal text-[#1e2033] mb-4 tracking-tight">
                Build anything with Vrika APIs
              </h2>
              <p className="text-lg text-[#64748b] font-sans-sarvam">
                Everything you need to add autonomous security intelligence to your product.
              </p>
            </motion.div>

            <div className="grid lg:grid-cols-2 gap-8 items-stretch">
              {/* Left Side: Terminal Transcript Panel */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
                className="rounded-3xl border border-slate-200/80 bg-gradient-to-b from-white via-white to-blue-50/60 p-8 shadow-sm flex flex-col justify-between h-full relative overflow-hidden"
              >
                <div>
                  <h3 className="font-serif-sarvam text-2xl md:text-3xl text-[#1e2033] mb-6 leading-snug max-w-sm">
                    Orchestrate <span className="text-[#3b82f6]">147+ Security Tools</span> <br />
                    autonomously
                  </h3>

                  {/* Terminal Execution Window */}
                  <div className="rounded-2xl bg-[#0f172a] border border-slate-700/80 overflow-hidden shadow-xl">
                    {/* Header Tabs Bar */}
                    <div className="flex items-center gap-2 border-b border-slate-700 bg-[#1e293b] px-4 py-3">
                      <div className="flex gap-1.5">
                        <div className="size-3 rounded-full bg-rose-500/80" />
                        <div className="size-3 rounded-full bg-amber-500/80" />
                        <div className="size-3 rounded-full bg-emerald-500/80" />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono ml-2">vrika-agent-runner ~ zsh</span>
                    </div>

                    {/* Terminal Content Area */}
                    <div className="p-5 overflow-x-auto text-xs font-mono leading-relaxed text-slate-300 h-[240px] flex flex-col">
                      <div className="flex items-center gap-2 mb-2 text-emerald-400">
                        <span>➜</span>
                        <span className="text-white">vrika run recon --target example.com</span>
                      </div>
                      <div className="text-slate-400 mb-2">[+] Initializing Autonomous Recon Agent...</div>
                      <div className="text-slate-400 mb-2">[+] Resolving target: example.com (93.184.216.34)</div>
                      <div className="text-blue-400 mb-2">[*] Spawning nmap: nmap -sV -sC -O -T4 93.184.216.34</div>
                      <div className="text-slate-300 mb-2">
                        Starting Nmap 7.94 ( https://nmap.org )<br/>
                        Nmap scan report for example.com (93.184.216.34)<br/>
                        Host is up (0.0051s latency).
                      </div>
                      <div className="text-slate-300 mb-2">
                        PORT    STATE SERVICE  VERSION<br/>
                        80/tcp  open  http     ECS (sec/97A5)<br/>
                        443/tcp open  ssl/http ECS (sec/97A5)
                      </div>
                      <div className="text-emerald-400 mt-auto pt-2">[✓] Recon chain completed. Pushing to Evidence Fabric.</div>
                    </div>
                  </div>
                </div>

                <div className="mt-8">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="inline-flex items-center justify-center rounded-full bg-[#1e2033] px-8 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-[#3a3f5c]"
                  >
                    Explore Vrika capabilities
                  </motion.button>
                </div>
              </motion.div>

              {/* Right Side: Capability Cards Grid */}
              <motion.div
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.7 }}
                className="flex flex-col gap-4 justify-between"
              >
                <div className="grid sm:grid-cols-2 gap-4 flex-1">
                  {API_CARDS.map((card) => (
                    <motion.div
                      key={card.title}
                      whileHover={{ y: -4 }}
                      className="relative rounded-2xl bg-white p-6 transition-all duration-300 flex flex-col justify-between overflow-hidden border border-slate-200/80 hover:border-slate-300 hover:shadow-md shadow-sm"
                    >
                      {/* Corner Vector Blob SVG */}
                      <CornerBlobSVG variant={card.blob} isHovered={true} />

                      <div className="relative z-10">
                        {/* Icon Badge */}
                        <div
                          className={`mb-4 inline-flex size-11 items-center justify-center rounded-xl transition-all duration-300 ${card.badgeColor}`}
                        >
                          <MaterialSymbol name={card.icon} className="text-xl" />
                        </div>

                        <h4 className="font-bold text-[#1e2033] mb-2 text-base font-sans-sarvam">
                          {card.title}
                        </h4>
                        <p className="text-sm text-[#64748b] leading-relaxed font-sans-sarvam">
                          {card.desc}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Bottom row: 3 developer cards */}
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    { title: "REST API", desc: "Clean, OpenAPI 3.0 documented endpoints" },
                    { title: "Docker & CLI", desc: "Run standalone or via Docker Compose" },
                    { title: "NyxStrike Arsenal", desc: "147+ integrated security binaries" },
                  ].map((item) => (
                    <motion.div
                      key={item.title}
                      whileHover={{ y: -3 }}
                      className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md transition-all"
                    >
                      <h4 className="font-bold text-[#1e2033] text-sm mb-1">{item.title}</h4>
                      <p className="text-xs text-[#64748b] leading-relaxed">{item.desc}</p>
                    </motion.div>
                  ))}
                </div>

              </motion.div>
            </div>
          </div>
        </section>

        {/* Section 3: Mission / Values */}
        <section className="bg-white py-24 border-t border-slate-200/80">
          <div className="mx-auto max-w-5xl px-6">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="font-serif-sarvam text-4xl md:text-5xl font-normal text-[#1e2033] text-center mb-16"
            >
              Powering the next era of offensive security
            </motion.h2>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="rounded-3xl border border-slate-200/80 bg-white shadow-xl overflow-hidden flex flex-col md:flex-row"
            >              {/* Left High-Res 3D Shield Arch Image Area */}
              <div className="md:w-5/12 relative overflow-hidden min-h-[300px] flex items-center justify-center bg-indigo-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/mission_ai.png"
                  alt="Sovereign Security AI"
                  className="w-full h-full object-cover transition-transform duration-500 hover:scale-105 invert hue-rotate-[195deg] saturate-150 contrast-125 opacity-90"
                />
              </div>



              {/* Right Values List */}
              <div className="md:w-7/12 p-10 md:p-14 bg-white flex flex-col justify-center gap-8">
                {[
                  {
                    title: "Sovereign by design",
                    desc: "Build, deploy, and run offensive ops with full control, developed and operated entirely in sanctioned environments.",
                  },
                  {
                    title: "State of the art models",
                    desc: "Industry-leading autonomous agents built for offensive security workflows.",
                  },
                  {
                    title: "Human at the core",
                    desc: "Forward deployed engineers work alongside your teams to deliver production-ready operations.",
                  },
                ].map((val) => (
                  <div key={val.title} className="flex items-start gap-4">
                    <div className="p-1 rounded-full bg-emerald-100 text-[#10b981] mt-1 shrink-0">
                      <MaterialSymbol name="auto_awesome" className="text-lg" />
                    </div>
                    <div>
                      <h4 className="font-bold text-[#1e2033] text-lg mb-1">{val.title}</h4>
                      <p className="text-[#64748b] leading-relaxed text-sm md:text-base">{val.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <div className="mt-12 text-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center justify-center rounded-full bg-[#1e2033] px-8 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-[#3a3f5c]"
              >
                Get Started
              </motion.button>
            </div>
          </div>
        </section>

        {/* Section 4: Full-Stack Platform */}
        <section className="bg-[#f8fafc] py-24 border-y border-slate-200/80">
          <div className="mx-auto max-w-7xl px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-16"
            >
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#64748b] mb-4">
                FOR ENTERPRISE | GOVERNMENT | SECURITY TEAMS
              </p>
              <h2 className="font-serif-sarvam text-4xl md:text-5xl font-normal text-[#1e2033]">
                The Full-Stack Sovereign Security Platform
              </h2>
            </motion.div>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Card 1: Autonomous Agents */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.1 }}
                whileHover={{ y: -6 }}
                className="rounded-3xl border border-slate-200/80 bg-white shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col"
              >
                <div className="w-full h-36 relative overflow-hidden bg-rose-50 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/pillar_card_1.png"
                    alt="Autonomous Agents Header"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-8 flex-1 flex flex-col">
                  <h3 className="text-2xl font-bold text-[#1e2033] mb-3">Autonomous Agents</h3>
                  <p className="text-[#64748b] mb-8 leading-relaxed text-sm">
                    Building security products teams can use. Conversational agents fluent in attack chains. Platforms that run offensive workflows from start to finish.
                  </p>
                  <ul className="space-y-3.5 mt-auto text-sm text-[#1e2033] font-medium">
                    <li className="flex justify-between border-b border-slate-100 pb-2.5">
                      <span>Recon Agent</span> <span className="text-[#64748b] text-xs">Reconnaissance</span>
                    </li>
                    <li className="flex justify-between border-b border-slate-100 pb-2.5">
                      <span>Chain Engine</span> <span className="text-[#64748b] text-xs">Exploit Chaining</span>
                    </li>
                    <li className="flex justify-between border-b border-slate-100 pb-2.5">
                      <span>Report Gen</span> <span className="text-[#64748b] text-xs">Documentation</span>
                    </li>
                    <li className="flex justify-between">
                      <span>Evidence Fabric</span> <span className="text-[#64748b] text-xs">Audit Trail</span>
                    </li>
                  </ul>
                </div>
              </motion.div>

              {/* Card 2: State-of-the-Art Models */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                whileHover={{ y: -6 }}
                className="rounded-3xl border border-slate-200/80 bg-white shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col"
              >
                <div className="w-full h-36 relative overflow-hidden bg-amber-50 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/pillar_card_2.png"
                    alt="State of the Art Models Header"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-8 flex-1 flex flex-col">
                  <h3 className="text-2xl font-bold text-[#1e2033] mb-3">State-of-the-Art Models</h3>
                  <p className="text-[#64748b] mb-8 leading-relaxed text-sm">
                    State-of-the-art models trained for offensive security, delivering strong performance across vulnerability analysis.
                  </p>
                  <ul className="space-y-3 mt-auto text-sm font-medium">
                    {[
                      { label: "Mesh Orchestration", badge: "Active", badgeBg: "bg-blue-50 text-[#3b82f6]" },
                      { label: "Policy Gates", badge: "Enforced", badgeBg: "bg-emerald-50 text-emerald-600" },
                      { label: "CVE Correlation", badge: "Live ↗", badgeBg: "bg-purple-50 text-purple-600" },
                      { label: "Evidence Fabric", badge: "Secured", badgeBg: "bg-amber-50 text-amber-600" },
                    ].map((m) => (
                      <li key={m.label} className="flex justify-between items-center bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                        <span className="text-[#1e2033] text-xs font-semibold">{m.label}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${m.badgeBg}`}>
                          {m.badge}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>

              {/* Card 3: Infrastructure */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.3 }}
                whileHover={{ y: -6 }}
                className="rounded-3xl border border-slate-200/80 bg-white shadow-sm hover:shadow-xl transition-all overflow-hidden flex flex-col"
              >
                <div className="w-full h-36 relative overflow-hidden bg-emerald-50 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/pillar_card_3.png"
                    alt="Infrastructure to Scale Header"
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="p-8 flex-1 flex flex-col">
                  <h3 className="text-2xl font-bold text-[#1e2033] mb-3">Infrastructure to Scale</h3>
                  <p className="text-[#64748b] mb-8 leading-relaxed text-sm">
                    A compute fabric built to handle complexity of agent serving so teams can focus on operations, not managing infrastructure.
                  </p>
                  <div className="mt-auto space-y-4">
                    <div className="border-b border-slate-100 pb-3">
                      <div className="text-3xl font-light text-[#1e2033]">10K+</div>
                      <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mt-0.5">Operations served</div>
                    </div>
                    <div className="border-b border-slate-100 pb-3">
                      <div className="text-3xl font-light text-[#1e2033]">&lt;100ms</div>
                      <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mt-0.5">Median latency</div>
                    </div>
                    <div>
                      <div className="text-3xl font-light text-[#1e2033]">99.9%</div>
                      <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mt-0.5">Uptime SLA</div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="mt-16 text-center">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center justify-center rounded-full bg-[#1e2033] px-8 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-[#3a3f5c]"
              >
                Start building with Vrika
              </motion.button>
            </div>
          </div>
        </section>

        {/* Section 5: Enterprise */}
        <section className="bg-white py-24">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mb-14"
            >
              <h2 className="font-serif-sarvam text-4xl md:text-5xl font-normal text-[#1e2033] mb-4">
                Enterprise-grade. Out of the box.
              </h2>
              <p className="text-lg text-[#64748b]">
                Compliance, control, and confidence. Not bolted on. Built in from day one.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-8 mb-8">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm hover:shadow-md transition-all"
              >
                <h3 className="text-2xl font-bold text-[#1e2033] mb-4">Forward deployed</h3>
                <p className="text-[#64748b] mb-6 leading-relaxed text-sm md:text-base">
                  Our engineers work alongside yours, designing agents, integrating systems, and staying until you&apos;re live. Not a handoff. A partnership.
                </p>
                <ul className="space-y-3.5 text-[#1e2033] font-medium text-sm">
                  {[
                    "Dedicated engineer from day one",
                    "Joint workflow design and build",
                    "Ongoing accuracy and cost optimisation",
                    "SLA-backed production support",
                  ].map((text) => (
                    <li key={text} className="flex items-center gap-3">
                      <div className="size-5 rounded-full bg-blue-50 text-[#3b82f6] flex items-center justify-center shrink-0">
                        <MaterialSymbol name="check" className="text-sm" />
                      </div>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="rounded-3xl border border-slate-200/80 bg-[#f8fafc] p-8 shadow-sm hover:shadow-md transition-all"
              >
                <h3 className="text-2xl font-bold text-[#1e2033] mb-4">Deployment flexibility</h3>
                <p className="text-[#64748b] mb-6 leading-relaxed text-sm md:text-base">
                  Vrika deploys where your data already lives. Private cloud, on-premise, hybrid, or fully air-gapped environments.
                </p>
                <ul className="space-y-3.5 text-[#1e2033] font-medium text-sm">
                  {[
                    "Private cloud, on-premise, or hybrid",
                    "Bring your own model or use ours",
                    "Swap vendors without rewriting workflows",
                    "Air-gapped deployment available",
                  ].map((text) => (
                    <li key={text} className="flex items-center gap-3">
                      <div className="size-5 rounded-full bg-blue-50 text-[#3b82f6] flex items-center justify-center shrink-0">
                        <MaterialSymbol name="check" className="text-sm" />
                      </div>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>

            {/* Security and Governance Card */}
            <motion.div
              initial={{ opacity: 0, y: 25 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-sm hover:shadow-md transition-all"
            >
              <h3 className="text-2xl font-bold text-[#1e2033] mb-4">Security and governance</h3>
              <p className="text-[#64748b] mb-8 max-w-3xl leading-relaxed text-sm md:text-base">
                Every agent action is logged and traceable. Role-based access, audit trails, and data residency controls built into the core.
              </p>
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-4 py-2 text-xs font-semibold text-blue-700">
                  <MaterialSymbol name="dns" className="text-blue-500 text-sm" /> Isolated Tenant Sandboxes
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50/80 px-4 py-2 text-xs font-semibold text-rose-700">
                  <MaterialSymbol name="group" className="text-rose-500 text-sm" /> Role-Based Access (RBAC)
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50/80 px-4 py-2 text-xs font-semibold text-emerald-700">
                  <MaterialSymbol name="history" className="text-emerald-500 text-sm" /> Cryptographic Audit Trail
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-purple-200 bg-purple-50/80 px-4 py-2 text-xs font-semibold text-purple-700">
                  <MaterialSymbol name="cloud_off" className="text-purple-500 text-sm" /> On-Premise & Air-Gap Ready
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/80 px-4 py-2 text-xs font-semibold text-amber-700">
                  <MaterialSymbol name="public" className="text-amber-500 text-sm" /> Data Residency Controls
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50/80 px-4 py-2 text-xs font-semibold text-indigo-700">
                  <MaterialSymbol name="gavel" className="text-indigo-500 text-sm" /> Policy Quarantine Gates
                </span>
              </div>

            </motion.div>

            <div className="mt-12">
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex items-center justify-center rounded-full bg-[#1e2033] px-8 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-[#3a3f5c]"
              >
                Contact Us
              </motion.button>
            </div>
          </div>
        </section>

        {/* Section 6: Animated Interactive FAQ */}
        <section id="faq" className="scroll-mt-28 px-6 py-24 bg-[#f8fafc] border-t border-slate-200/80">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-center text-xs font-bold uppercase tracking-[0.25em] text-[#3b82f6]"
          >
            FAQ
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 15 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-3 text-center font-serif-sarvam text-4xl font-normal text-[#1e2033] md:text-5xl"
          >
            Everything your security council will ask.
          </motion.h2>

          <div className="mx-auto mt-14 max-w-3xl space-y-4">
            {FAQ_ITEMS.map((item, idx) => (
              <motion.div
                key={item.q}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.08 }}
                className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden shadow-sm"
              >
                <button
                  onClick={() => setOpenFaqIndex(openFaqIndex === idx ? null : idx)}
                  className="w-full flex items-center justify-between p-6 text-left font-bold text-[#1e2033] text-base hover:text-[#3b82f6] transition-colors"
                >
                  <span>{item.q}</span>
                  <MaterialSymbol
                    name="keyboard_arrow_down"
                    className={`text-2xl transition-transform duration-300 ${
                      openFaqIndex === idx ? "rotate-180 text-[#3b82f6]" : "text-slate-400"
                    }`}
                  />
                </button>
                <AnimatePresence>
                  {openFaqIndex === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                    >
                      <div className="px-6 pb-6 text-slate-600 text-sm leading-relaxed border-t border-slate-100 pt-4">
                        {item.a}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </section>
      </main>

      {/* Section 7: Footer with Security Gradient Watermark */}
      <footer className="border-t border-slate-200/80 bg-white pt-16 pb-8 text-[#1e2033]">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid gap-10 md:grid-cols-4">
            <div className="md:col-span-1 space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo_with_text_with_shield.png" alt="Vrika" className="h-9 w-auto object-contain" />
              <p className="text-xs text-slate-500 leading-relaxed">
                Sovereign GenAI-native offensive security fabric. Built for sanctioned environments.
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="text-xs font-bold tracking-widest text-[#1e2033] uppercase">Platform</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                {FOOTER_PLATFORM_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="transition-colors hover:text-[#3b82f6]">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="text-xs font-bold tracking-widest text-[#1e2033] uppercase">Resources</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                {FOOTER_RESOURCE_LINKS.map(({ href, label }) => (
                  <li key={href}>
                    <Link href={href} className="transition-colors hover:text-[#3b82f6]">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="text-xs font-bold tracking-widest text-[#1e2033] uppercase">Company</h4>
              <ul className="space-y-2 text-sm text-slate-600">
                <li>
                  <Link href="/about" className="transition-colors hover:text-[#3b82f6]">
                    About Us
                  </Link>
                </li>
                <li>
                  <Link href="/terms-of-use" className="transition-colors hover:text-[#3b82f6]">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <Link href="/privacy-policy" className="transition-colors hover:text-[#3b82f6]">
                    Privacy Policy
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 border-t border-slate-100 pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-slate-500 gap-4">
            <div>{FOOTER_COPYRIGHT}</div>
            <div className="flex gap-4">
              {FOOTER_LEGAL_LINKS.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-[#3b82f6]">
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          {/* Giant Security-Ops Gradient Watermark */}
          <div className="mt-16 -mb-6 select-none pointer-events-none overflow-hidden px-4">
            <span
              className="font-serif-sarvam text-[18vw] font-black leading-[0.9] tracking-tight uppercase block text-center whitespace-nowrap"
              style={{
                background: "linear-gradient(135deg, #1e3a5f 0%, #3b82f6 25%, #06b6d4 50%, #8b5cf6 75%, #1e3a5f 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                WebkitTextFillColor: "transparent",
                color: "transparent",
                opacity: 0.12,
              }}
            >
              VRIKA
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
