"use client";

import { motion } from "framer-motion";

/** Authentic Sarvam AI double-scroll flourish motif */
export function SarvamFlourishSVG() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="mb-6 flex justify-center text-[#c084fc]"

    >
      <svg width="76" height="30" viewBox="0 0 76 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M 38,14 C 30,5 18,3 10,8 C 4,12 4,19 9,22 C 14,25 22,20 28,15 C 43,11 38,14 38,14"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M 38,14 C 46,5 58,3 66,8 C 72,12 72,19 67,22 C 62,25 54,20 48,15 C 43,11 38,14 38,14"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M 24,23 C 32,26 44,26 52,23"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="38" cy="14" r="2.2" fill="currentColor" />
      </svg>
    </motion.div>
  );
}

/** Authentic Sarvam AI Organic Vector Corner Graphics (Exact Match to Lotus & Cloud Shapes) */
export function CornerBlobSVG({
  variant = "cloud",
  isHovered = false,
}: {
  variant?: "cloud" | "petal" | "mandala" | "flower";
  isHovered?: boolean;
}) {
  return (
    <div
      className={`absolute top-0 right-0 w-32 h-32 pointer-events-none overflow-hidden rounded-tr-2xl transition-all duration-500 ease-out ${
        isHovered
          ? "opacity-100 scale-100 translate-x-0 translate-y-0"
          : "opacity-0 scale-90 translate-x-2 -translate-y-2"
      }`}
    >
      {/* Variant 1: Sarvam Organic Cloud Shape (Text to Speech equivalent) */}
      {variant === "cloud" && (
        <svg viewBox="0 0 120 120" fill="none" className="w-full h-full transform translate-x-1 -translate-y-1">
          <defs>
            <linearGradient id="sarvamCloudGrad" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.9" />
              <stop offset="45%" stopColor="#60a5fa" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#818cf8" stopOpacity="0.95" />
            </linearGradient>
          </defs>
          <path
            d="M 120,0 L 40,0 C 45,18 30,30 20,40 C 8,50 15,68 30,75 C 45,82 60,95 78,88 C 95,80 108,90 120,70 Z"
            fill="url(#sarvamCloudGrad)"
          />
        </svg>
      )}

      {/* Variant 2: Sarvam Lotus Petal Cluster (Speech to Text equivalent) */}
      {variant === "petal" && (
        <svg viewBox="0 0 120 120" fill="none" className="w-full h-full transform translate-x-1 -translate-y-1">
          <defs>
            <linearGradient id="sarvamLotusGrad" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#be123c" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#fb7185" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#fca5a5" stopOpacity="0.75" />
            </linearGradient>
          </defs>
          {/* Multi-petal Lotus Silhouette radiating from top-right */}
          <path
            d="M 120,0 L 35,0 C 45,15 40,32 30,42 C 20,52 32,65 48,68 C 55,70 58,82 68,85 C 78,88 85,78 95,85 C 105,92 120,78 120,60 Z"
            fill="url(#sarvamLotusGrad)"
          />
        </svg>
      )}

      {/* Variant 3: Sarvam Mandala Shield Crest (Policy Gates equivalent) */}
      {variant === "mandala" && (
        <svg viewBox="0 0 120 120" fill="none" className="w-full h-full transform translate-x-1 -translate-y-1">
          <defs>
            <linearGradient id="sarvamMandalaGrad" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <path
            d="M 120,0 L 45,0 C 50,20 35,35 25,48 C 15,60 30,75 50,78 C 70,82 82,95 98,85 C 112,75 120,80 120,55 Z"
            fill="url(#sarvamMandalaGrad)"
          />
        </svg>
      )}

      {/* Variant 4: Sarvam Floral Star Motif (CVE Correlation equivalent) */}
      {variant === "flower" && (
        <svg viewBox="0 0 120 120" fill="none" className="w-full h-full transform translate-x-1 -translate-y-1">
          <defs>
            <linearGradient id="sarvamFloralGrad" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#db2777" stopOpacity="0.9" />
              <stop offset="60%" stopColor="#9333ea" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#c084fc" stopOpacity="0.8" />
            </linearGradient>
          </defs>
          <path
            d="M 120,0 L 40,0 C 48,15 32,28 22,42 C 10,55 25,72 45,76 C 65,80 75,98 92,90 C 108,82 120,85 120,60 Z"
            fill="url(#sarvamFloralGrad)"
          />
        </svg>
      )}
    </div>
  );
}

/** Sarvam 3D Arch Vector Motif for Section 3 (Mission / Values) */
export function SarvamMissionArchSVG() {
  return (
    <div className="relative w-full h-full flex items-center justify-center min-h-[300px] select-none">
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background: "radial-gradient(circle at 50% 40%, #c4b5fd 0%, #a5bbfd 40%, transparent 70%)",
        }}
      />
      <svg className="w-full h-full max-w-[340px] max-h-[260px] relative z-10" viewBox="0 0 300 220" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="archGrad1" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.7" />
          </linearGradient>
          <linearGradient id="archGrad2" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0.8" />
          </linearGradient>
          <linearGradient id="archGrad3" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.75" />
            <stop offset="100%" stopColor="#dbeafe" stopOpacity="0.9" />
          </linearGradient>
        </defs>

        <path
          d="M 20,200 C 20,130 60,110 90,110 C 120,110 130,90 150,90 C 170,90 180,110 210,110 C 240,110 280,130 280,200 Z"
          fill="url(#archGrad1)"
        />
        <path
          d="M 45,200 C 45,145 80,125 110,125 C 135,125 140,110 150,110 C 160,110 165,125 190,125 C 220,125 255,145 255,200 Z"
          fill="url(#archGrad2)"
        />
        <path
          d="M 75,200 C 75,160 105,145 130,145 C 145,145 147,135 150,135 C 153,135 155,145 170,145 C 195,145 225,160 225,200 Z"
          fill="url(#archGrad3)"
        />

        <g transform="translate(150, 50)">
          <circle cx="0" cy="0" r="22" stroke="white" strokeWidth="1.8" fill="white" fillOpacity="0.15" />
          <polygon points="0,-16 12,-6 12,8 0,16 -12,8 -12,-6" stroke="white" strokeWidth="1.5" fill="none" />
          <polygon points="0,-10 8,-2 4,8 -4,8 -8,-2" stroke="white" strokeWidth="1" fill="white" fillOpacity="0.3" />
          <circle cx="0" cy="0" r="3" fill="white" />
        </g>
      </svg>
    </div>
  );
}

/** Pillar 1 Card Top Graphic */
export function PillarAgentsHeaderSVG() {
  return (
    <div className="w-full h-36 relative overflow-hidden flex items-center justify-center" style={{ background: "linear-gradient(135deg, #fecdd3 0%, #ffedd5 100%)" }}>
      <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 200 100" fill="none">
        <circle cx="100" cy="50" r="80" stroke="#f43f5e" strokeWidth="1" strokeDasharray="4 4" />
        <circle cx="100" cy="50" r="50" stroke="#f43f5e" strokeWidth="1" />
      </svg>
      <div className="relative z-10 size-16 rounded-full bg-white/60 backdrop-blur-md border border-rose-200/80 shadow-sm flex items-center justify-center">
        <svg className="size-9 text-rose-500" viewBox="0 0 36 36" fill="none">
          <circle cx="18" cy="18" r="14" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 3" />
          <circle cx="18" cy="18" r="8" stroke="currentColor" strokeWidth="1.8" />
          <path d="M18 4V12 M18 24V32 M4 18H12 M24 18H32" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="18" cy="18" r="3" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

/** Pillar 2 Card Top Graphic */
export function PillarModelsHeaderSVG() {
  return (
    <div className="w-full h-36 relative overflow-hidden flex items-center justify-center" style={{ background: "linear-gradient(135deg, #fed7aa 0%, #fef3c7 100%)" }}>
      <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 200 100" fill="none">
        <path d="M100 10 C120 40, 160 50, 180 50 C160 50, 120 60, 100 90 C80 60, 40 50, 20 50 C40 50, 80 40, 100 10 Z" stroke="#ea580c" strokeWidth="1.5" />
      </svg>
      <div className="relative z-10 size-16 rounded-full bg-white/60 backdrop-blur-md border border-amber-200/80 shadow-sm flex items-center justify-center">
        <svg className="size-10 text-amber-600" viewBox="0 0 40 40" fill="none">
          <path d="M20 8 C23 16, 30 18, 34 22 C30 24, 23 26, 20 32 C17 26, 10 24, 6 22 C10 18, 17 16, 20 8 Z" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="1.8" />
          <path d="M20 14 C22 19, 26 20, 28 22 C26 24, 22 25, 20 30 C18 25, 14 24, 12 22 C14 20, 18 19, 20 14 Z" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

/** Pillar 3 Card Top Graphic */
export function PillarInfraHeaderSVG() {
  return (
    <div className="w-full h-36 relative overflow-hidden flex items-center justify-center" style={{ background: "linear-gradient(135deg, #dcfce7 0%, #f0fdf4 100%)" }}>
      <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 200 100" fill="none">
        <circle cx="100" cy="50" r="75" stroke="#16a34a" strokeWidth="1" />
        <path d="M100 10 V90 M20 50 H180" stroke="#16a34a" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
      <div className="relative z-10 size-16 rounded-full bg-white/60 backdrop-blur-md border border-emerald-200/80 shadow-sm flex items-center justify-center">
        <svg className="size-9 text-emerald-600" viewBox="0 0 36 36" fill="none">
          <path d="M18 4 L30 9 V18 C30 25 24 30 18 32 C12 30 6 25 6 18 V9 L18 4 Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="18" cy="17" r="5" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15 17 L17 19 L21 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
