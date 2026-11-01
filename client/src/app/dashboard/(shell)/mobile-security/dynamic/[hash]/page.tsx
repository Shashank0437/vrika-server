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
  Globe,
  Lock,
  Pause,
  Play,
  ScrollText,
  ShieldCheck,
  ShieldOff,
  Square,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";
import { hasPermission } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import {
  engineAction,
  engineStream,
  getDynamicSession,
  getReport,
  getScan,
  timeAgo,
  type DynamicSession,
  type MobileReport,
  type MobileScan,
} from "@/lib/mobileSecurity";
import { MOBILE_SECURITY_HREF, mobileDynamicHref } from "@/lib/mobile-security-nav";
import { ActionForm, Panel, ResultView, useEngine } from "@/components/mobile-security/dynamic";
import { asArr, asObj, str } from "@/components/mobile-security/ReportSections";
import { ErrorBanner, PageHeader, PlatformAvatar, primaryButton, secondaryButton, Spinner } from "@/components/mobile-security/ui";
import { WorkspaceSelect } from "@/components/ui/WorkspaceSelect";

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

function LiveScreen({ canExecute }: { canExecute: boolean }) {
  const [frame, setFrame] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await engineAction<{ message?: string }>("android.screen_cast");
        if (!stop && typeof r.message === "string" && r.message.startsWith("data:image/")) setFrame(r.message);
        setError(null);
      } catch (e) {
        if (!stop) setError(e instanceof Error ? e.message : "Screen stream failed");
      }
      if (!stop) setTimeout(tick, 400);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [live]);

  function devicePoint(clientX: number, clientY: number) {
    const el = img.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(((clientX - rect.left) / rect.width) * el.naturalWidth),
      y: Math.round(((clientY - rect.top) / rect.height) * el.naturalHeight),
      max_x: el.naturalWidth,
      max_y: el.naturalHeight,
    };
  }

  function send(params: Record<string, string | number>) {
    const el = img.current;
    engineAction("android.touch_events", {
      x: 0,
      y: 0,
      max_x: el?.naturalWidth ?? 0,
      max_y: el?.naturalHeight ?? 0,
      ...params,
    }).catch((e) => setError(e instanceof Error ? e.message : "Input failed"));
  }

  function onUp(e: React.MouseEvent) {
    const start = drag.current;
    drag.current = null;
    const end = devicePoint(e.clientX, e.clientY);
    if (!start || !end) return;
    const moved = Math.hypot(end.x - start.x, end.y - start.y) > 25;
    send(moved ? { ...start, end_x: end.x, end_y: end.y, max_x: end.max_x, max_y: end.max_y, event: "swipe" } : { ...end, event: "touch" });
  }

  const keyBtn = `${secondaryButton} h-9 px-3 text-xs`;
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative flex h-[520px] w-[292px] items-center justify-center overflow-hidden rounded-[2rem] border-[6px] border-[#1b1b21] bg-[#1b1b21] shadow-xl">
        {frame ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={img}
            src={frame}
            alt="Live device screen"
            draggable={false}
            className={`max-h-full max-w-full select-none object-contain ${canExecute ? "cursor-pointer" : ""}`}
            onMouseDown={(e) => {
              if (!canExecute) return;
              const p = devicePoint(e.clientX, e.clientY);
              if (p) drag.current = { x: p.x, y: p.y };
            }}
            onMouseUp={(e) => canExecute && onUp(e)}
          />
        ) : (
          live ? (
            <span className="flex flex-col items-center gap-2 text-xs text-white/70">
              <Spinner className="size-8" label="Connecting to device" /> Connecting to device…
            </span>
          ) : (
            <p className="px-6 text-center text-xs text-white/60">Press Go live to mirror the device screen.</p>
          )
        )}
        {live && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-error px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-white" /> Live
          </span>
        )}
      </div>
      <button className={live ? secondaryButton : primaryButton} onClick={() => setLive((v) => !v)}>
        {live ? <Pause className="size-4" /> : <Play className="size-4" />}
        {live ? "Pause" : "Go live"}
      </button>
      {canExecute && live && (
        <>
          <div className="flex flex-wrap justify-center gap-1.5">
            <button className={keyBtn} onClick={() => send({ event: "back" })}>Back</button>
            <button className={keyBtn} onClick={() => send({ event: "home" })}>Home</button>
            <button className={keyBtn} onClick={() => send({ event: "recents" })}>Recents</button>
          </div>
          <form
            className="flex w-full max-w-[292px] gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!text) return;
              send({ event: "text", x: text });
              setText("");
            }}
          >
            <input
              className="h-9 min-w-0 flex-1 rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-2.5 text-xs outline-none focus:border-primary"
              placeholder="Type on device…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" className={keyBtn}>Send</button>
            <button type="button" className={keyBtn} onClick={() => send({ event: "enter" })}>⏎</button>
          </form>
        </>
      )}
      {error && <p className="max-w-[292px] text-center text-xs text-error">{error}</p>}
    </div>
  );
}

function Screens({ hash, canExecute, version }: { hash: string; canExecute: boolean; version: number }) {
  const { busy, error, run } = useEngine();
  const [shots, setShots] = useState<{ name: string; data: string }[]>([]);
  const load = useCallback(async () => {
    const r = await run<{ screenshots?: { name: string; data: string }[] }>("android.screenshots", { hash }, "list");
    if (r) setShots(asArr(r.screenshots) as { name: string; data: string }[]);
  }, [hash, run]);
  useEffect(() => {
    void load();
  }, [load, version]);
  return (
    <Panel
      title="Screen"
      description="Live device screen — click to tap, drag to swipe. Capture screenshots for the report."
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
            {busy === "shot" ? <Spinner /> : <Camera className="size-4" />}
            Screenshot
          </button>
        )
      }
    >
      {error && <ErrorBanner message={error} />}
      <div className="flex flex-col gap-6 lg:flex-row">
        <LiveScreen canExecute={canExecute} />
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Screenshots</p>
          {shots.length ? (
            <div className="flex flex-wrap gap-3">
              {shots.map((s) => (
                <a key={s.name} href={s.data} download={s.name} className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.data} alt={s.name} className="h-44 rounded-xl border border-outline-variant/60 object-contain" />
                </a>
              ))}
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant">No screenshots captured yet.</p>
          )}
        </div>
      </div>
    </Panel>
  );
}

type LogFn = (label: string, ok: boolean, detail?: unknown) => void;

const FRIDA_TEMPLATE = "Java.perform(function() {\n  // Use send() for logging\n});\n";

function FridaPanel({ hash, log }: { hash: string; log: LogFn }) {
  const [defaults, setDefaults] = useState<string[]>(DEFAULT_HOOKS.map(([v]) => v));
  const [aux, setAux] = useState<string[]>([]);
  const [code, setCode] = useState(FRIDA_TEMPLATE);
  const [cls, setCls] = useState({ class_name: "", class_search: "", class_trace: "" });
  const [scripts, setScripts] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [scriptQuery, setScriptQuery] = useState("");
  const [procs, setProcs] = useState<{ pid: number; name: string; identifier: string }[] | null>(null);
  const [target, setTarget] = useState("");
  const { busy, error, run, attempt } = useEngine();

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
        <div className="min-w-56 flex-1 space-y-1">
          <span className="text-xs font-semibold text-on-surface-variant">Script library {picked.length > 0 && `(${picked.length} selected)`}</span>
          <input
            type="search"
            placeholder="Search scripts…"
            value={scriptQuery}
            onChange={(e) => setScriptQuery(e.target.value)}
            className="no-search-cancel h-9 w-full rounded-xl border border-outline-variant/70 bg-surface-container-lowest px-3 text-xs outline-none focus:border-primary"
          />
          <div className="terminal-scroll flex max-h-40 flex-wrap gap-1.5 overflow-auto rounded-xl border border-outline-variant/50 bg-surface-container-low p-2">
            {scripts
              .filter((s) => s.toLowerCase().includes(scriptQuery.toLowerCase()))
              .map((s) => {
                const on = picked.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setPicked((cur) => (on ? cur.filter((x) => x !== s) : [...cur, s]))}
                    className={`rounded-lg px-2 py-1 font-mono text-[11px] transition ${on ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface ring-1 ring-outline-variant/60 hover:ring-primary/50"}`}
                  >
                    {s}
                  </button>
                );
              })}
            {!scripts.length && <span className="text-xs text-on-surface-variant">No scripts available.</span>}
          </div>
        </div>
        <button
          className={secondaryButton}
          disabled={!picked.length || busy !== null}
          onClick={async () => {
            const r = await run<{ content?: string }>("frida.get_script", { device: "android", "scripts[]": picked }, "load");
            if (r) setCode((c) => `${c}${c.endsWith("\n") || !c ? "" : "\n"}${str(r.content)}`);
          }}
        >
          Load scripts
        </button>
        <button className={secondaryButton} disabled={!code || busy !== null} onClick={() => setCode("")}>
          Clear editor
        </button>
      </div>
      {scriptWarnings(code).map((w) => (
        <div key={w} className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
          {w}
        </div>
      ))}
      <textarea
        className="min-h-40 w-full rounded-xl border border-outline-variant/70 bg-[#17151f] p-3 font-mono text-xs text-[#e9e6f5] outline-none focus:border-primary"
        placeholder="// Custom Frida script (JavaScript)"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        spellCheck={false}
      />
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["spawn", "Spawn & Inject", primaryButton, "Restart the app under Frida and load the selected hooks/script from its first instruction."],
            ["session", "Inject", secondaryButton, "Load the current script into the Frida session already running (after Spawn & Inject or Attach)."],
          ] as const
        ).map(([action, label, cls_, hint]) => (
          <button key={action} className={cls_} title={hint} disabled={busy !== null} onClick={() => void instrument(action)}>
            {busy === action ? <Spinner /> : <Play className="size-4" />}
            {label}
          </button>
        ))}
        <button
          className={secondaryButton}
          title="List running apps, then hook into one without restarting it."
          disabled={busy !== null}
          onClick={async () => {
            const r = await attempt<{ message?: unknown }>("frida.instrument", { ...hooks(), frida_action: "ps" }, "ps");
            const list = r.ok ? asArr(r.data.message).map(asObj).map((p) => ({ pid: Number(p.pid), name: str(p.name), identifier: str(p.identifier) })) : [];
            setProcs(list);
            log("List running apps", r.ok, r.ok ? `${list.length} processes` : r.error);
          }}
        >
          {busy === "ps" ? <Spinner /> : <Activity className="size-4" />}
          Attach
        </button>
        <button
          className={secondaryButton}
          title="Restart the app briefly to record classes/DEX files it loads at runtime."
          disabled={busy !== null}
          onClick={async () => {
            const r = await attempt("frida.get_dependencies", { hash }, "deps");
            log("Get dependencies", r.ok, r.ok ? r.data : r.error);
          }}
        >
          Get dependencies
        </button>
      </div>
      {procs && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-container-low p-3">
          <WorkspaceSelect
            className="min-w-64 flex-1"
            label="Running app"
            value={target}
            placeholder={procs.length ? "Select a running app…" : "No running apps found"}
            options={procs.map((p) => ({ value: `${p.pid}|${p.identifier}`, label: `${p.name} (PID ${p.pid})`, description: p.identifier }))}
            onChange={setTarget}
          />
          <button
            className={primaryButton}
            disabled={!target || busy !== null}
            onClick={() => {
              const [pid, pkg] = target.split("|");
              void instrument("session", { pid, new_package: pkg });
            }}
          >
            Attach &amp; inject
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} />}
    </Panel>
  );

  function hooks() {
    return { hash, default_hooks: defaults.join(","), auxiliary_hooks: aux.join(","), frida_code: code, ...cls };
  }

  async function instrument(action: "spawn" | "session", extra: Record<string, string> = {}) {
    const r = await attempt("frida.instrument", { ...hooks(), frida_action: action, ...extra }, action);
    const label = extra.pid ? `Attach to ${extra.new_package} (PID ${extra.pid})` : action === "spawn" ? "Spawn & inject" : "Inject into session";
    log(label, r.ok, r.ok ? r.data : r.error);
  }
}

function scriptWarnings(code: string): string[] {
  const out: string[] = [];
  if (/\{(className|classMethod|args|methodSignature)\}|some\.package\./.test(code))
    out.push("The editor contains template placeholders (e.g. {className}, some.package.Activity). Replace them with real class/method names or remove that script, otherwise it throws errors in the app.");
  if (/SDK_INT\.value\s*=/.test(code))
    out.push("helper-android-change-sdk-version spoofs the Android API level (15). Modern apps (OkHttp, etc.) crash at startup with it, so the app will not open. Remove it unless you need it.");
  return out;
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
      if (!stop && r) {
        const body = asObj(r);
        const empty = body.data === undefined && /does not exist|no data/i.test(str(body.message));
        if (!empty) setData(body.data ?? body.message ?? r);
      }
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
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [shotVersion, setShotVersion] = useState(0);
  const [session, setSession] = useState<DynamicSession | null | undefined>(undefined);
  const { busy, error: actionError, run } = useEngine();
  const log = useCallback<LogFn>((label, ok, detail) => {
    setEntries((list) => [{ at: new Date().toLocaleTimeString(), label, ok, detail }, ...list].slice(0, 100));
  }, []);

  useEffect(() => {
    getScan(hash).then(setScan).catch((e) => setError(e instanceof Error ? e.message : "Scan not found"));
    getReport(hash).then(setReport).catch(() => setReport(null));
    getDynamicSession(hash).then((r) => setSession(r.session)).catch(() => setSession(null));
  }, [hash]);

  const pkg = str(report?.package_name) || scan?.package_name || "";
  const activities = asArr(report?.activities).map(str);
  const exported = asArr(report?.exported_activities).map(str);

  async function stop() {
    const r = await run<{ report_id?: string }>("dynamic.stop_analysis", { hash }, "stop");
    if (r) router.push(`${mobileDynamicHref(hash)}/report${r.report_id ? `?id=${encodeURIComponent(r.report_id)}` : ""}`);
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
                {busy === "stop" ? <Spinner /> : <Square className="size-4" />}
                Stop &amp; generate report
              </button>
            )}
          </>
        }
      />
      {error && <ErrorBanner message={error} />}
      {actionError && <ErrorBanner message={actionError} />}
      {session !== undefined && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-4 py-3 text-sm">
          <span className={`size-2 rounded-full ${session && !session.stopped_at ? "animate-pulse bg-tertiary" : "bg-outline"}`} />
          {session ? (
            <span className="text-on-surface-variant">
              {session.stopped_at ? "Last session" : "Session running"} — started {timeAgo(session.started_at)}
              {session.started_by && ` by ${session.started_by}`}. Screenshots and results below belong to this session only; earlier runs are kept in report history.
            </span>
          ) : (
            <span className="text-on-surface-variant">
              No session started yet. Start one from{" "}
              <Link className="font-semibold text-primary hover:underline" href={`${MOBILE_SECURITY_HREF}/dynamic/android`}>
                Android Dynamic Analyzer
              </Link>
              .
            </span>
          )}
        </div>
      )}

      {canExecute && <SessionToolbar hash={hash} log={log} onShot={() => setShotVersion((v) => v + 1)} />}
      <SessionLog entries={entries} />

      <Screens version={shotVersion} hash={hash} canExecute={canExecute} />
      {canExecute && <FridaPanel hash={hash} log={log} />}

      <div className="grid gap-5 lg:grid-cols-2">
        <PollingPanel title="API monitor" description="Live Android API calls captured by Frida." icon={<Activity className="size-4" />} action="frida.api_monitor" hash={hash} />
        <PollingPanel title="Frida logs" description="Output from your Frida scripts." icon={<Bug className="size-4" />} action="frida.logs" hash={hash} />
      </div>

      <div id="web-traffic">
        <WebTrafficPanel hash={hash} />
      </div>

      {canExecute && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ActionForm
            title="User interface — start activity"
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
            submitLabel="Start activity"
            onResult={(r) => log("Start activity", true, r)}
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

      <div id="logcat">
        <LogcatPanel pkg={pkg} />
      </div>
    </section>
  );
}

type LogEntry = { at: string; label: string; ok: boolean; detail?: unknown };

const TOOLBAR: { key: string; label: string; action: string; params?: Record<string, string>; icon: React.ReactNode }[] = [
  { key: "ca-install", label: "Install Root CA", action: "android.root_ca", params: { action: "install" }, icon: <ShieldCheck className="size-4" /> },
  { key: "ca-remove", label: "Remove Root CA", action: "android.root_ca", params: { action: "remove" }, icon: <ShieldOff className="size-4" /> },
  { key: "proxy-set", label: "Set HTTP(S) Proxy", action: "android.global_proxy", params: { action: "set" }, icon: <Wifi className="size-4" /> },
  { key: "proxy-unset", label: "Unset HTTP(S) Proxy", action: "android.global_proxy", params: { action: "unset" }, icon: <WifiOff className="size-4" /> },
  { key: "tls", label: "TLS/SSL Security Tester", action: "android.tls_tests", icon: <Lock className="size-4" /> },
  { key: "exported", label: "Exported Activity Tester", action: "android.activity", params: { test: "exported" }, icon: <Activity className="size-4" /> },
  { key: "activity", label: "Activity Tester", action: "android.activity", params: { test: "activity" }, icon: <Activity className="size-4" /> },
  { key: "deps", label: "Get Dependencies", action: "frida.get_dependencies", icon: <Code2 className="size-4" /> },
  { key: "shot", label: "Take a Screenshot", action: "android.screenshot", icon: <Camera className="size-4" /> },
];

function SessionToolbar({ hash, log, onShot }: { hash: string; log: LogFn; onShot: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function run(item: (typeof TOOLBAR)[number]) {
    setBusy(item.key);
    try {
      const needsHash = !["android.root_ca", "android.global_proxy"].includes(item.action);
      const r = await engineAction(item.action, { ...(needsHash ? { hash } : {}), ...item.params }, false);
      log(item.label, true, r);
      if (item.key === "shot") onShot();
    } catch (e) {
      log(item.label, false, e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  }
  const btn = `${secondaryButton} h-9 px-3 text-xs`;
  return (
    <div className="flex flex-wrap gap-2 rounded-2xl border border-outline-variant/70 bg-surface-container-lowest p-3 shadow-sm">
      {TOOLBAR.map((item) => (
        <button key={item.key} className={btn} disabled={busy !== null} onClick={() => void run(item)}>
          {busy === item.key ? <Spinner /> : item.icon}
          {item.label}
        </button>
      ))}
      <a href="#logcat" className={btn}>
        <ScrollText className="size-4" /> Logcat Stream
      </a>
      <a href="#web-traffic" className={btn}>
        <Globe className="size-4" /> Live Web Traffic
      </a>
    </div>
  );
}

function SessionLog({ entries }: { entries: LogEntry[] }) {
  const [tab, setTab] = useState<"all" | "errors">("all");
  const [open, setOpen] = useState<number | null>(null);
  const shown = tab === "errors" ? entries.filter((e) => !e.ok) : entries;
  const errors = entries.filter((e) => !e.ok).length;
  return (
    <Panel
      title="Dynamic analyzer"
      description="Results of actions run in this session."
      icon={<ScrollText className="size-4" />}
      actions={
        <div className="flex gap-1">
          {(["all", "errors"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${tab === t ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"}`}
            >
              {t === "all" ? "Activity" : `Errors${errors ? ` (${errors})` : ""}`}
            </button>
          ))}
        </div>
      }
    >
      {shown.length ? (
        <ul className="terminal-scroll max-h-72 space-y-1 overflow-auto">
          {shown.map((e, i) => (
            <li key={`${e.at}-${i}`} className="rounded-lg bg-surface-container-low px-3 py-2 text-xs">
              <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(open === i ? null : i)}>
                <span className={`size-1.5 rounded-full ${e.ok ? "bg-tertiary" : "bg-error"}`} />
                <span className="font-mono text-on-surface-variant">{e.at}</span>
                <span className="font-semibold text-on-surface">{e.label}</span>
                <span className={e.ok ? "text-tertiary" : "text-error"}>{e.ok ? "done" : "failed"}</span>
              </button>
              {open === i && e.detail !== undefined && (
                <div className="mt-2">
                  <ResultView value={e.detail} maxHeight="max-h-64" />
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-on-surface-variant">{tab === "errors" ? "No errors." : "Run an action above — results will be listed here."}</p>
      )}
    </Panel>
  );
}

type FlowMeta = { id: string; method: string; relative: string; url: string; status_code?: number | string };

function WebTrafficPanel({ hash }: { hash: string }) {
  const [flows, setFlows] = useState<Record<string, FlowMeta[]> | null>(null);
  const [selected, setSelected] = useState<unknown>(null);
  const [live, setLive] = useState(false);
  const { error, run } = useEngine();

  const load = useCallback(async () => {
    const r = await run<{ sorted_flows?: Record<string, FlowMeta[]> }>("android.web_traffic", { hash }, "flows");
    if (r) setFlows(asObj(r.sorted_flows) as Record<string, FlowMeta[]>);
  }, [hash, run]);

  useEffect(() => {
    if (!live) return;
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [live, load]);

  const domains = Object.entries(flows ?? {});
  return (
    <Panel
      title="Live web traffic"
      description="HTTP(S) requests captured through the analysis proxy (set the proxy and install the Root CA first)."
      icon={<Globe className="size-4" />}
      actions={
        <button className={secondaryButton} onClick={() => setLive((v) => !v)}>
          {live ? <Pause className="size-4" /> : <Play className="size-4" />}
          {live ? "Pause" : "Live"}
        </button>
      }
    >
      {error && !/not found/i.test(error) && <ErrorBanner message={error} />}
      {domains.length ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <ul className="terminal-scroll max-h-96 space-y-3 overflow-auto">
            {domains.map(([domain, list]) => (
              <li key={domain}>
                <p className="mb-1 font-mono text-xs font-semibold text-on-surface">{domain}</p>
                <ul className="space-y-0.5">
                  {asArr(list).map((f) => {
                    const flow = f as FlowMeta;
                    return (
                      <li key={flow.id}>
                        <button
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left font-mono text-[11px] hover:bg-surface-container"
                          onClick={async () => setSelected(await run("android.web_traffic", { hash, flow_id: flow.id }, "flow"))}
                        >
                          <span className="w-12 shrink-0 font-semibold text-primary">{flow.method}</span>
                          <span className="w-9 shrink-0 text-on-surface-variant">{str(flow.status_code)}</span>
                          <span className="truncate text-on-surface">{flow.relative}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
          <div>{selected ? <ResultView value={selected} maxHeight="max-h-96" /> : <p className="text-sm text-on-surface-variant">Select a request to inspect headers and bodies.</p>}</div>
        </div>
      ) : (
        <p className="text-sm text-on-surface-variant">{live ? "Waiting for traffic — use the app on the device." : "Press Live to load captured traffic."}</p>
      )}
    </Panel>
  );
}
