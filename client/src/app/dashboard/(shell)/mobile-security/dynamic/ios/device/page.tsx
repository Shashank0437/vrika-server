"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Code2, Cpu, Download, FileBarChart2, ListTree, ScrollText, Smartphone, Terminal, Upload } from "lucide-react";
import { hasPermission } from "@/lib/access";
import { useAuth } from "@/lib/auth-context";
import { MOBILE_SECURITY_HREF } from "@/lib/mobile-security-nav";
import { ActionForm, KeyValueGrid, Panel } from "@/components/mobile-security/dynamic";
import { asArr, asObj, str } from "@/components/mobile-security/ReportSections";
import { EngineStatusBanner, PageHeader } from "@/components/mobile-security/ui";

const FRIDA_IOS_DEFAULT = "api_monitor,ssl_pinning_bypass,jailbreak_detection_bypass,dump_crypto,dump_data";

export default function IosDevicePage() {
  const { user } = useAuth();
  const canExecute = hasPermission(user, "execute", { module: "mobile_security" });
  const [ctx, setCtx] = useState<Record<string, unknown> | null>(null);

  const apps = asArr(ctx?.apps).map(asObj);
  const devices = [...asArr(ctx?.usb_devices), ...asArr(ctx?.wifi_devices)].map((d) => {
    const o = asObj(d);
    const id = str(o.udid ?? o.id ?? o.ip ?? d);
    return { value: id, label: str(o.name) ? `${str(o.name)} (${id})` : id };
  });
  const selected = str(ctx?.selected_device);
  const deviceField = devices.length
    ? { name: "device_id", label: "Device", type: "select" as const, options: devices, defaultValue: selected, required: true }
    : { name: "device_id", label: "Device UDID or IP", placeholder: "00008030-… or 192.168.1.20", defaultValue: selected, required: true };
  const bundleOptions = apps.map((a) => ({ value: str(a.BUNDLE_ID), label: `${str(a.APP_NAME) || str(a.FILE_NAME)} (${str(a.BUNDLE_ID)})` }));
  const bundleField = bundleOptions.length
    ? { name: "bundle_id", label: "App", type: "select" as const, options: bundleOptions, required: true }
    : { name: "bundle_id", label: "Bundle ID", placeholder: "com.example.app", required: true };
  const ipaOptions = apps.map((a) => ({ value: str(a.MD5), label: `${str(a.APP_NAME) || str(a.FILE_NAME)}${a.ENCRYPTED ? " · encrypted" : ""}` }));

  return (
    <section className="mx-auto w-full max-w-6xl space-y-7 px-5 py-8 sm:px-8 lg:py-10">
      <Link href={`${MOBILE_SECURITY_HREF}/dynamic`} className="inline-flex items-center gap-1.5 text-sm font-semibold text-on-surface-variant hover:text-primary">
        <ArrowLeft className="size-4" /> Dynamic Analysis
      </Link>
      <PageHeader
        eyebrow="Mobile Security / Dynamic Analysis / iOS"
        title="iOS Dynamic Analyzer — Jailbroken device"
        description="Analyse IPAs on a physical jailbroken iPhone over USB or Wi-Fi: install, instrument with Frida, inspect processes and data."
      />
      <EngineStatusBanner />

      <ActionForm
        title="Connect device"
        description="Discover USB / Wi-Fi devices and list IPAs available for analysis."
        icon={<Smartphone className="size-4" />}
        action="ios.device_dynamic_analysis"
        fields={[{ name: "device_id", label: "Device UDID or IP (optional for discovery)", placeholder: "00008030-…" }]}
        submitLabel="Connect"
        onResult={(r) => setCtx(asObj(r))}
      />

      {ctx && (
        <Panel title="Environment" icon={<Cpu className="size-4" />}>
          <KeyValueGrid
            items={[
              ["Selected device", selected || "–"],
              ["USB devices", asArr(ctx.usb_devices).length],
              ["Wi-Fi devices", asArr(ctx.wifi_devices).length],
              ["IPAs available", apps.length],
            ]}
          />
        </Panel>
      )}

      <div key={`${selected}-${apps.length}-${devices.length}`} className="grid gap-5 lg:grid-cols-2">
        <ActionForm title="Device details & installed apps" icon={<Smartphone className="size-4" />} action="ios.device_get" fields={[deviceField]} submitLabel="Load" />
        {canExecute && (
          <>
            <ActionForm
              title="Install IPA"
              icon={<Download className="size-4" />}
              action="ios.device_install_ipa"
              fields={[deviceField, ipaOptions.length ? { name: "checksum", label: "IPA", type: "select", options: ipaOptions, required: true } : { name: "checksum", label: "IPA scan hash", required: true }]}
              submitLabel="Install"
            />
            <ActionForm title="Dynamic analyzer" description="Prepare the analyzer context for an app on the device." icon={<Cpu className="size-4" />} action="ios.device_dynamic_analyzer" fields={[deviceField, bundleField]} submitLabel="Open" />
            <ActionForm
              title="Frida instrumentation"
              icon={<Code2 className="size-4" />}
              action="ios.device_instrument"
              fields={[
                deviceField,
                bundleField,
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
            <ActionForm title="SSH command" icon={<Terminal className="size-4" />} action="ios.device_ssh_execute" fields={[deviceField, { name: "cmd", label: "Command", placeholder: "ls /var/mobile", required: true }]} submitLabel="Execute" />
            <ActionForm title="Download app data" icon={<Download className="size-4" />} action="ios.device_download_app_data" fields={[deviceField, bundleField]} submitLabel="Download" />
            <ActionForm title="Upload file to device" icon={<Upload className="size-4" />} action="ios.device_file_upload" fields={[deviceField]} submitLabel="Upload" mode="upload" />
          </>
        )}
        <ActionForm title="Running processes" icon={<ListTree className="size-4" />} action="ios.device_ps" fields={[deviceField]} submitLabel="List processes" />
        <ActionForm title="System logs" icon={<ScrollText className="size-4" />} action="ios.device_system_logs" fields={[deviceField]} submitLabel="Fetch logs" />
        <ActionForm title="API monitor" icon={<ScrollText className="size-4" />} action="ios.device_api_monitor" fields={[deviceField, bundleField]} submitLabel="Fetch" />
        <ActionForm title="Download file from device" icon={<Download className="size-4" />} action="ios.device_file_download" fields={[deviceField, { name: "file", label: "Remote path", placeholder: "/var/mobile/…", required: true }]} submitLabel="Download" mode="download" />
      </div>

      <ActionForm
        title="Dynamic analysis report"
        icon={<FileBarChart2 className="size-4" />}
        action="ios.device_report_json"
        fields={[deviceField, bundleField]}
        submitLabel="Load report"
      />
    </section>
  );
}
