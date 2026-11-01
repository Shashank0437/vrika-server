"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Bug,
  Camera,
  Code2,
  FileBarChart2,
  Loader2,
  Lock,
  Pause,
  Play,
  ScrollText,
  Square,
  Terminal,
} from "lucide-react";
import { hasPermission } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import { engineStream, getReport, getScan, type MobileReport, type MobileScan } from "@/lib/mobileSecurity";
import { MOBILE_SECURITY_HREF, mobileDynamicHref } from "@/lib/mobile-security-nav";
import { ActionForm, Panel, ResultView, useEngine } from "@/components/mobile-security/dynamic";
import { asArr, asObj, str } from "@/components/mobile-security/ReportSections";
import { ErrorBanner, PageHeader, PlatformAvatar, primaryButton, secondaryButton } from "@/components/mobile-security/ui";

const DEFAULT_HOOKS = [
  ["api_monitor", "API Monitor"],
  ["ssl_pinning_bypass", "SSL pinning bypass"],
  ["root_bypass", "Root detection bypass"],
  ["debugger_check_bypass", "Debugger check bypass"],
  ["dump_clipboard", "Clipboard monitor"],
] as const;
const AUX_HOOKS = [
  ["enum_class", "Enumerate loaded classes"],
  ["string_catch", "Capture strings"],
  ["string_compare", "Capture string comparisons"],
  ["enum_methods", "Enumerate class methods"],
  ["search_class", "Search class pattern"],
  ["trace_class", "Trace class methods"],
] as const;

function Screens({ hash, canExecute }: { hash: string; canExecute: boolean }) {
  const { busy, error, run } = useEngine();
  const [shots, setShots] = useState<{ name: string; data: string }[]>([]);
  const load = useCallback(async () => {
    const r = await run<{ screenshots?: { name: string; data: string }[] }>("android.screenshots", { hash }, "list");
    if (r) setShots(asArr(r.screenshots) as { name: string; data: string }[]);
  }, [hash, run]);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash]);
  return (
    <Panel
      title="Screen"
      description="Capture the device screen during testing."
      icon={<Camera className="size-4" />}
      actions={
        canExecute && (
          <button
            className={primaryButton}
            disabled={busy !== null}
            onClick={async () => {
              if (await run("android.screenshot", { hash }, "shot")) void load();
            }}
          >
            {busy === "shot" ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
            Screenshot
          </button>
        )
      }
    >
      {error && <ErrorBanner message={error} />}
      {shots.length ? (
        <div className="terminal-scroll flex gap-3 overflow-x-auto pb-2">
          {shots.map((s) => (
            <a key={s.name} href={s.data} download={s.name} className="shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.data} alt={s.name} className="h-72 rounded-xl border border-outline-variant/60 object-contain" />
            </a>
          ))}
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">No screenshots captured yet.</p>
      )}
    </Panel>
  );
}

function FridaPanel({ hash }: { hash: string }) {
  const [defaults, setDefaults] = useState<string[]>(DEFAULT_HOOKS.map(([v]) => v));
  const [aux, setAux] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [cls, setCls] = useState({ class_name: "", class_search: "", class_trace: "" });
  const [mode, setMode] = useState<"spawn" | "session">("spawn");
  const [scripts, setScripts] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const { busy, error, run } = useEngine();

  useEffect(() => {
    run<{ files?: string[] }>("frida.list_scripts", { device: "android" }, "scripts").then((r) => r && setScripts(asArr(r.files).map(str)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <Panel title="Frida instrumentation" description="Spawn or attach with default bypass hooks, auxiliary tracers and your own scripts." icon={<Code2 className="size-4" />}>
      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Default hooks</legend>
          {DEFAULT_HOOKS.map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={defaults.includes(v)} onChange={() => toggle(defaults, setDefaults, v)} />
              {label}
            </label>
          ))}
        </fieldset>
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Auxiliary</legend>
          {AUX_HOOKS.map(([v, label]) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={aux.includes(v)} onChange={() => toggle(aux, setAux, v)} />
              {label}
            </label>
          ))}
        </fieldset>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {(
          [
            ["class_name", "Class for method enumeration", "java.io.File"],
            ["class_search", "Class search pattern", "ssl\\.Trust*"],
            ["class_trace", "Classes to trace", "java.net.Socket,java.io.File"],
          ] as const
        ).map(([k, label, ph]) => (
          <label key={k} className="block space-y-1">
            <span className="text-xs font-semibold text-on-surface-variant">{label}</span>
            <input
              className="w-full rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-3 py-2 font-mono text-xs outline-none focus:border-primary"
              placeholder={ph}
              value={cls[k]}
              onChange={(e) => setCls((c) => ({ ...c, [k]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-56 flex-1 space-y-1">
          <span className="text-xs font-semibold text-on-surface-variant">Script library</span>
          <select
            multiple
            className="h-24 w-full rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-2 py-1 text-xs outline-none focus:border-primary"
            value={picked}
            onChange={(e) => setPicked(Array.from(e.target.selectedOptions).map((o) => o.value))}
          >
            {scripts.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          className={secondaryButton}
          disabled={!picked.length || busy !== null}
          onClick={async () => {
            const r = await run<{ content?: string }>("frida.get_script", { device: "android", "scripts[]": picked }, "load");
            if (r) setCode((c) => `${c}${c ? "\n" : ""}${str(r.content)}`);
          }}
        >
          Load scripts
        </button>
      </div>
      <textarea
        className="min-h-40 w-full rounded-xl border border-outline-variant/70 bg-[#17151f] p-3 font-mono text-xs text-[#e9e6f5] outline-none focus:border-primary"
        placeholder="// Custom Frida script (JavaScript)"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center gap-2">
        <select className="h-10 rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-3 text-sm" value={mode} onChange={(e) => setMode(e.target.value as "spawn" | "session")}>
          <option value="spawn">Spawn &amp; inject</option>
          <option value="session">Inject into running session</option>
        </select>
        <button
          className={primaryButton}
          disabled={busy !== null}
          onClick={async () => {
            const r = await run(
              "frida.instrument",
              {
                hash,
                frida_action: mode,
                default_hooks: defaults.join(","),
                auxiliary_hooks: aux.join(","),
                frida_code: code,
                ...cls,
              },
              "instrument",
            );
            if (r) setResult(r);
          }}
        >
          {busy === "instrument" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Start instrumentation
        </button>
        <button className={secondaryButton} disabled={busy !== null} onClick={async () => setResult(await run("frida.get_dependencies", { hash }, "deps"))}>
          Runtime dependencies
        </button>
      </div>
      {error && <ErrorBanner message={error} />}
      {result !== null && <ResultView value={result} />}
    </Panel>
  );
}

function PollingPanel({ title, description, icon, action, hash }: { title: string; description: string; icon: React.ReactNode; action: string; hash: string }) {
  const [live, setLive] = useState(false);
  const [data, setData] = useState<unknown>(null);
  const { error, run } = useEngine();
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      const r = await run(action, { hash, stream: "1" }, "poll");
      if (!stop && r) setData(asObj(r).data ?? asObj(r).message ?? r);
    };
    void tick();
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [live, action, hash, run]);
  return (
    <Panel
      title={title}
      description={description}
      icon={icon}
      actions={
        <button className={secondaryButton} onClick={() => setLive((v) => !v)}>
          {live ? <Pause className="size-4" /> : <Play className="size-4" />}
          {live ? "Pause" : "Live"}
        </button>
      }
    >
      {error && !/does not exist|no data/i.test(error) && <ErrorBanner message={error} />}
      {data !== null ? (
        <ResultView value={data} />
      ) : (
        <p className="text-sm text-on-surface-variant">
          {live ? "Waiting for data — start instrumentation with the matching hook enabled." : "Press Live to start polling."}
        </p>
      )}
    </Panel>
  );
}

function LogcatPanel({ pkg }: { pkg: string }) {
  const [text, setText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const box = useRef<HTMLPreElement>(null);
  useEffect(() => () => ctrl.current?.abort(), []);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [text]);
  async function toggle() {
    if (running) {
      ctrl.current?.abort();
      setRunning(false);
      return;
    }
    ctrl.current = new AbortController();
    setRunning(true);
    setError(null);
    try {
      await engineStream("android.logcat", { package: pkg }, (c) => setText((t) => (t + c).slice(-200_000)), ctrl.current.signal);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError(e instanceof Error ? e.message : "Logcat failed");
    } finally {
      setRunning(false);
    }
  }
  return (
    <Panel
      title="Logcat"
      description={`Live device logs for ${pkg || "the app"}.`}
      icon={<ScrollText className="size-4" />}
      actions={
        <button className={secondaryButton} disabled={!pkg} onClick={() => void toggle()}>
          {running ? <Square className="size-4" /> : <Play className="size-4" />}
          {running ? "Stop" : "Stream"}
        </button>
      }
    >
      {error && <ErrorBanner message={error} />}
      <pre ref={box} className="terminal-scroll h-72 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-[#17151f] p-4 font-mono text-[11px] leading-relaxed text-[#d9d5ec]">
        {text || "Logcat output will appear here."}
      </pre>
    </Panel>
  );
}

export default function AndroidDynamicSessionPage() {
  const { hash } = useParams<{ hash: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const canExecute = hasPermission(user, "execute", { module: "mobile_security" });
  const [scan, setScan] = useState<MobileScan | null>(null);
  const [report, setReport] = useState<MobileReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, error: actionError, run } = useEngine();

  useEffect(() => {
    getScan(hash).then(setScan).catch((e) => setError(e instanceof Error ? e.message : "Scan not found"));
    getReport(hash).then(setReport).catch(() => setReport(null));
  }, [hash]);

  const pkg = str(report?.package_name) || scan?.package_name || "";
  const activities = asArr(report?.activities).map(str);
  const exported = asArr(report?.exported_activities).map(str);

  async function stop() {
    if (await run("dynamic.stop_analysis", { hash }, "stop")) router.push(`${mobileDynamicHref(hash)}/report`);
  }

  return (
    <section className="mx-auto w-full max-w-6xl space-y-6 px-5 py-8 sm:px-8 lg:py-10">
      <Link href={`${MOBILE_SECURITY_HREF}/dynamic/android`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary">
        <ArrowLeft className="size-4" /> Android Dynamic Analyzer
      </Link>
      <PageHeader
        eyebrow="Mobile Security / Dynamic Analysis / Session"
        title={
          <span className="flex items-center gap-3">
            {scan && <PlatformAvatar scan={scan} />}
            <span className="truncate">{scan?.app_name || scan?.file_name || "Dynamic session"}</span>
          </span>
        }
        description={pkg ? `Package ${pkg}` : undefined}
        actions={
          <>
            <Link href={`${mobileDynamicHref(hash)}/report`} className={secondaryButton}>
              <FileBarChart2 className="size-4" /> Report
            </Link>
            {canExecute && (
              <button className={primaryButton} disabled={busy !== null} onClick={() => void stop()}>
                {busy === "stop" ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
                Stop &amp; generate report
              </button>
            )}
          </>
        }
      />
      {error && <ErrorBanner message={error} />}
      {actionError && <ErrorBanner message={actionError} />}

      <Screens hash={hash} canExecute={canExecute} />
      {canExecute && <FridaPanel hash={hash} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <PollingPanel title="API monitor" description="Live Android API calls captured by Frida." icon={<Activity className="size-4" />} action="frida.api_monitor" hash={hash} />
        <PollingPanel title="Frida logs" description="Output from your Frida scripts." icon={<Bug className="size-4" />} action="frida.logs" hash={hash} />
      </div>

      {canExecute && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ActionForm
            title="Activity tester"
            description="Launch every activity (or only exported ones) and capture screens."
            icon={<Activity className="size-4" />}
            action="android.activity"
            fixed={{ hash }}
            fields={[{ name: "test", label: "Test", type: "select", options: [{ value: "exported", label: "Exported activities" }, { value: "activity", label: "All activities" }], defaultValue: "exported", required: true }]}
            submitLabel="Run tester"
          />
          <ActionForm
            title="Start activity"
            description="Launch a specific activity on the device."
            icon={<Play className="size-4" />}
            action="android.start_activity"
            fixed={{ hash }}
            fields={[
              activities.length
                ? {
                    name: "activity",
                    label: "Activity",
                    type: "select",
                    required: true,
                    options: activities.map((a) => ({ value: a, label: exported.includes(a) ? `${a} (exported)` : a })),
                  }
                : { name: "activity", label: "Activity", placeholder: "com.example.MainActivity", required: true },
            ]}
            submitLabel="Start"
          />
          <ActionForm
            title="TLS / SSL security tests"
            description="Checks cleartext traffic, certificate pinning and transparency."
            icon={<Lock className="size-4" />}
            action="android.tls_tests"
            fixed={{ hash }}
            submitLabel="Run TLS tests"
          />
          <ActionForm
            title="ADB shell"
            description="Run an ADB command on the analysis device."
            icon={<Terminal className="size-4" />}
            action="android.adb_command"
            fields={[{ name: "cmd", label: "Command", placeholder: "shell pm list packages -3", required: true }]}
            submitLabel="Execute"
          />
        </div>
      )}

      <LogcatPanel pkg={pkg} />
    </section>
  );
}
