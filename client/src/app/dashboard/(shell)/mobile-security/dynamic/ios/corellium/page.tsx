"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Camera,
  Code2,
  Cpu,
  Download,
  FileBarChart2,
  FolderOpen,
  Hand,
  Network,
  Play,
  Power,
  RefreshCcw,
  ScrollText,
  Settings2,
  Terminal,
  Upload,
} from "lucide-react";
import { hasPermission } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import { engineAction } from "@/lib/mobileSecurity";
import { MOBILE_SECURITY_HREF } from "@/lib/mobile-security-nav";
import { ActionForm, KeyValueGrid, Panel, ResultView, useEngine } from "@/components/mobile-security/dynamic";
import { asArr, asObj, str } from "@/components/mobile-security/ReportSections";
import { card, EngineStatusBanner, ErrorBanner, PageHeader, PageLoader, secondaryButton } from "@/components/mobile-security/ui";

const FRIDA_IOS_DEFAULT = "api_monitor,ssl_pinning_bypass,jailbreak_detection_bypass,dump_crypto,dump_data";

export default function IosCorelliumPage() {
  const { user } = useAuth();
  const canExecute = hasPermission(user, "execute", { module: "mobile_security" });
  const canEdit = hasPermission(user, "edit", { module: "mobile_security" });
  const [info, setInfo] = useState<Record<string, unknown> | null>(null);
  const [models, setModels] = useState<{ value: string; label: string }[]>([]);
  const [versions, setVersions] = useState<{ value: string; label: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [instanceResult, setInstanceResult] = useState<unknown>(null);
  const { busy, error, run } = useEngine();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setInfo(await engineAction("ios.dynamic_analysis"));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load Corellium status");
    }
  }, []);

  useEffect(() => {
    void load();
    engineAction("ios.corellium_supported_models")
      .then((r) => {
        const list = asArr(asObj(r).models ?? asObj(r).message ?? r);
        setModels(list.map((m) => {
          const o = asObj(m);
          const value = str(o.model ?? o.flavor ?? m);
          return { value, label: str(o.name ?? o.description) || value };
        }));
      })
      .catch(() => null);
  }, [load]);

  const instances = asArr(info?.instances).map(asObj);
  const apps = asArr(info?.apps).map(asObj);
  const instanceOptions = instances.map((i) => ({ value: str(i.id), label: `${str(i.name) || str(i.id)} · ${str(i.state)}` }));
  const appOptions = apps.map((a) => ({ value: str(a.BUNDLE_ID), label: `${str(a.APP_NAME) || str(a.FILE_NAME)} (${str(a.BUNDLE_ID)})` }));
  const hashOptions = apps.map((a) => ({ value: str(a.MD5), label: `${str(a.APP_NAME) || str(a.FILE_NAME)} ${a.ENCRYPTED ? "· encrypted" : ""}` }));
  const instanceField = { name: "instance_id", label: "Instance", type: "select" as const, options: instanceOptions, required: true };
  const bundleField = { name: "bundle_id", label: "App", type: "select" as const, options: appOptions, required: true };
  const projectId = str(info?.project_id);

  const lifecycle = useMemo(
    () =>
      [
        ["ios.corellium_start_instance", "Start", Power],
        ["ios.corellium_stop_instance", "Stop", Power],
        ["ios.corellium_unpause_instance", "Unpause", Play],
        ["ios.corellium_reboot_instance", "Reboot", RefreshCcw],
        ["ios.corellium_list_apps", "List apps", FolderOpen],
      ] as const,
    [],
  );

  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <Link href={`${MOBILE_SECURITY_HREF}/dynamic`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary">
        <ArrowLeft className="size-4" /> Dynamic Analysis
      </Link>
      <PageHeader
        eyebrow="Mobile Security / Dynamic Analysis / iOS"
        title="iOS Dynamic Analyzer — Corellium"
        description="Create and control Corellium virtual iPhones, install IPAs, instrument with Frida and capture traffic."
        actions={
          <button className={secondaryButton} onClick={() => void load()}>
            <RefreshCcw className="size-4" /> Refresh
          </button>
        }
      />
      <EngineStatusBanner />
      {loadError && <ErrorBanner message={loadError} onRetry={() => void load()} />}
      {error && <ErrorBanner message={error} />}

      <Panel title="Corellium" icon={<Cpu className="size-4" />} description={info?.dynamic_analyzer ? "Authenticated with Corellium." : "Corellium API is not configured. Set CORELLIUM_API_DOMAIN, CORELLIUM_API_KEY and CORELLIUM_PROJECT_ID on the engine."}>
        {info ? (
          <KeyValueGrid
            items={[
              ["API", info.dynamic_analyzer ? "Connected" : "Not configured"],
              ["Project", projectId || "–"],
              ["Instances", instances.length],
              ["IPAs available", apps.length],
            ]}
          />
        ) : (
          <PageLoader label="Checking Corellium…" className="py-6" />
        )}
      </Panel>

      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center gap-2.5 border-b border-outline-variant/60 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-semibold">Instances</h2>
          <span className="rounded-md bg-primary/8 px-2 py-0.5 text-xs font-semibold text-primary">{instances.length}</span>
        </div>
        {instances.length ? (
          <ul className="divide-y divide-outline-variant/50">
            {instances.map((i) => {
              const id = str(i.id);
              return (
                <li key={id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-on-surface">{str(i.name) || id}</p>
                    <p className="truncate font-mono text-xs text-on-surface-variant">
                      {id} · {str(i.flavor)} · iOS {str(i.os)} · {str(i.state)}
                    </p>
                  </div>
                  {canExecute &&
                    lifecycle.map(([action, label, Icon]) => (
                      <button
                        key={action}
                        className={secondaryButton}
                        disabled={busy !== null}
                        onClick={async () => {
                          const r = await run(action, { instance_id: id }, `${action}-${id}`);
                          if (r) {
                            setInstanceResult(r);
                            void load();
                          }
                        }}
                      >
                        <Icon className="size-4" /> {label}
                      </button>
                    ))}
                  {canEdit && (
                    <button
                      className={`${secondaryButton} hover:!bg-error/8 hover:!text-error`}
                      disabled={busy !== null}
                      onClick={async () => {
                        if (window.confirm(`Destroy instance ${str(i.name) || id}?`) && (await run("ios.corellium_destroy_instance", { instance_id: id }))) void load();
                      }}
                    >
                      Destroy
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-6 py-6 text-sm text-on-surface-variant">No Corellium instances.</p>
        )}
        {instanceResult !== null && (
          <div className="border-t border-outline-variant/50 p-5">
            <ResultView value={instanceResult} />
          </div>
        )}
      </div>

      {canExecute && (
        <div className="grid gap-5 lg:grid-cols-2">
          <ActionForm
            title="Create iOS instance"
            icon={<Cpu className="size-4" />}
            action="ios.corellium_create_ios_instance"
            fixed={{ project_id: projectId }}
            fields={[
              { name: "name", label: "Name", placeholder: "vrika-ios", required: true },
              models.length
                ? { name: "flavor", label: "Device model", type: "select", options: models, required: true }
                : { name: "flavor", label: "Device model", placeholder: "iphone12", required: true },
              versions.length
                ? { name: "version", label: "iOS version", type: "select", options: versions, required: true }
                : { name: "version", label: "iOS version", placeholder: "16.0", required: true },
            ]}
            submitLabel="Create"
            onResult={() => void load()}
          />
          <ActionForm
            title="Supported iOS versions"
            description="Load firmware versions for a device model."
            icon={<Settings2 className="size-4" />}
            action="ios.corellium_ios_versions"
            fields={[
              models.length
                ? { name: "model", label: "Device model", type: "select", options: models, required: true }
                : { name: "model", label: "Device model", placeholder: "iphone12", required: true },
            ]}
            submitLabel="Load versions"
            onResult={(r) => {
              const list = asArr(asObj(r).versions ?? asObj(r).message ?? r);
              setVersions(list.map((v) => ({ value: str(asObj(v).version ?? v), label: str(asObj(v).version ?? v) })));
            }}
          />
          <ActionForm
            title="Setup environment"
            description="Install the IPA and Frida tooling on an instance."
            icon={<Settings2 className="size-4" />}
            action="ios.setup_environment"
            fields={[instanceField, { name: "hash", label: "IPA", type: "select", options: hashOptions, required: true }]}
            submitLabel="Setup"
          />
          <ActionForm title="Run app" icon={<Play className="size-4" />} action="ios.run_app" fields={[instanceField, bundleField]} submitLabel="Run" />
          <ActionForm title="Stop app" icon={<Power className="size-4" />} action="ios.stop_app" fields={[instanceField, bundleField]} submitLabel="Stop" />
          <ActionForm title="Remove app" icon={<Power className="size-4" />} action="ios.remove_app" fields={[instanceField, bundleField]} submitLabel="Remove" />
          <ActionForm title="Dynamic analyzer" description="Open the analyzer context for an app on an instance." icon={<Cpu className="size-4" />} action="ios.dynamic_analyzer" fields={[instanceField, bundleField]} submitLabel="Open" />
          <ActionForm
            title="Frida instrumentation"
            icon={<Code2 className="size-4" />}
            action="frida.ios_instrument"
            fields={[
              instanceField,
              bundleField,
              { name: "hash", label: "IPA scan", type: "select", options: hashOptions, required: true },
              { name: "default_hooks", label: "Default hooks (comma separated)", defaultValue: FRIDA_IOS_DEFAULT },
              { name: "dump_hooks", label: "Dump hooks (comma separated)", placeholder: "network_requests,crypto" },
              { name: "auxiliary_hooks", label: "Auxiliary hooks (comma separated)", placeholder: "classes,methods" },
              { name: "class_name", label: "Class name", placeholder: "NSURLSession" },
              { name: "class_search", label: "Class search", placeholder: "Crypto*" },
              { name: "class_trace", label: "Class trace", placeholder: "NSURLSession,NSString" },
              { name: "frida_code", label: "Custom Frida script", type: "textarea", placeholder: "// JavaScript" },
              { name: "frida_action", label: "Mode", type: "select", options: [{ value: "spawn", label: "Spawn" }, { value: "session", label: "Attach to session" }], defaultValue: "spawn" },
            ]}
            submitLabel="Instrument"
          />
          <ActionForm title="Screenshot" icon={<Camera className="size-4" />} action="ios.take_screenshot" fields={[instanceField]} submitLabel="Capture" />
          <ActionForm
            title="Touch / text input"
            icon={<Hand className="size-4" />}
            action="ios.instance_input"
            fields={[
              instanceField,
              { name: "event", label: "Event", type: "select", options: ["touch", "text", "home", "enter", "backspace", "left", "right", "swipe_up", "swipe_down"].map((v) => ({ value: v, label: v })), required: true },
              { name: "x", label: "X (or text to type for the text event)", placeholder: "100" },
              { name: "y", label: "Y", placeholder: "200" },
              { name: "max_x", label: "Screen width", placeholder: "390" },
              { name: "max_y", label: "Screen height", placeholder: "844" },
            ]}
            submitLabel="Send"
          />
          <ActionForm title="SSH command" icon={<Terminal className="size-4" />} action="ios.ssh_execute" fields={[instanceField, { name: "cmd", label: "Command", placeholder: "ls /var/mobile", required: true }]} submitLabel="Execute" />
          <ActionForm
            title="Network capture"
            icon={<Network className="size-4" />}
            action="ios.network_capture"
            fields={[instanceField, { name: "state", label: "State", type: "select", options: [{ value: "on", label: "Start" }, { value: "off", label: "Stop" }], required: true }]}
            submitLabel="Apply"
          />
          <ActionForm title="Download live PCAP" icon={<Download className="size-4" />} action="ios.live_pcap_download" fields={[instanceField]} submitLabel="Download" mode="download" />
          <ActionForm title="System logs" icon={<ScrollText className="size-4" />} action="ios.system_logs" fields={[instanceField]} submitLabel="Fetch logs" />
          <ActionForm title="App container path" icon={<FolderOpen className="size-4" />} action="ios.get_app_container_path" fields={[instanceField, bundleField]} submitLabel="Resolve" />
          <ActionForm title="Download app data" icon={<Download className="size-4" />} action="ios.download_app_data" fields={[instanceField, bundleField]} submitLabel="Download" />
          <ActionForm title="Upload file to instance" icon={<Upload className="size-4" />} action="ios.file_upload" fields={[instanceField]} submitLabel="Upload" mode="upload" />
          <ActionForm title="Download file from instance" icon={<Download className="size-4" />} action="ios.file_download" fields={[instanceField, { name: "file", label: "Remote path", placeholder: "/var/mobile/…", required: true }]} submitLabel="Download" mode="download" />
        </div>
      )}

      <ActionForm
        title="Dynamic analysis report"
        description="Frida dumps, traffic and runtime findings for an app."
        icon={<FileBarChart2 className="size-4" />}
        action="dynamic.ios_report_json"
        fields={[instanceField, bundleField]}
        submitLabel="Load report"
      />
    </section>
  );
}
