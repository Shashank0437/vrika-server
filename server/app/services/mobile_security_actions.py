"""Allowlisted engine operations exposed through /mobile-security/engine/{action}."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EngineAction:
    path: str
    permission: str
    method: str = "POST"
    # Params holding scan hashes that must belong to the caller's organization.
    owned: tuple[str, ...] = ()
    stream: bool = False


def _a(path: str, permission: str, **kw) -> EngineAction:
    return EngineAction(path=f"/api/v1/{path}", permission=permission, **kw)


H = ("hash",)

ENGINE_ACTIONS: dict[str, EngineAction] = {
    # Android dynamic analysis
    "dynamic.get_apps": _a("dynamic/get_apps", "view", method="GET"),
    "dynamic.start_analysis": _a("dynamic/start_analysis", "execute", owned=H),
    "dynamic.stop_analysis": _a("dynamic/stop_analysis", "execute", owned=H),
    "dynamic.report_json": _a("dynamic/report_json", "view", owned=H),
    "dynamic.view_source": _a("dynamic/view_source", "view", owned=H),
    "android.logcat": _a("android/logcat", "execute", stream=True),
    "android.mobsfy": _a("android/mobsfy", "execute"),
    "android.screenshot": _a("android/screenshot", "execute", owned=H),
    "android.screenshots": _a("android/screenshots", "view", owned=H),
    "android.adb_command": _a("android/adb_command", "execute"),
    "android.root_ca": _a("android/root_ca", "execute"),
    "android.global_proxy": _a("android/global_proxy", "execute"),
    "android.activity": _a("android/activity", "execute", owned=H),
    "android.start_activity": _a("android/start_activity", "execute", owned=H),
    "android.tls_tests": _a("android/tls_tests", "execute", owned=H),
    # Frida
    "frida.instrument": _a("frida/instrument", "execute", owned=H),
    "frida.api_monitor": _a("frida/api_monitor", "view", owned=H),
    "frida.get_dependencies": _a("frida/get_dependencies", "execute", owned=H),
    "frida.logs": _a("frida/logs", "view", owned=H),
    "frida.list_scripts": _a("frida/list_frida_scripts", "view"),
    "frida.get_script": _a("frida/get_script", "view"),
    "frida.ios_instrument": _a("frida/ios_instrument", "execute", owned=H),
    # iOS dynamic analysis (Corellium)
    "ios.dynamic_analysis": _a("ios/dynamic_analysis", "view"),
    "ios.corellium_supported_models": _a("ios/corellium_supported_models", "view"),
    "ios.corellium_ios_versions": _a("ios/corellium_ios_versions", "view"),
    "ios.corellium_create_ios_instance": _a("ios/corellium_create_ios_instance", "execute"),
    "ios.corellium_start_instance": _a("ios/corellium_start_instance", "execute"),
    "ios.corellium_stop_instance": _a("ios/corellium_stop_instance", "execute"),
    "ios.corellium_unpause_instance": _a("ios/corellium_unpause_instance", "execute"),
    "ios.corellium_reboot_instance": _a("ios/corellium_reboot_instance", "execute"),
    "ios.corellium_destroy_instance": _a("ios/corellium_destroy_instance", "edit"),
    "ios.corellium_list_apps": _a("ios/corellium_list_apps", "view"),
    "ios.setup_environment": _a("ios/setup_environment", "execute", owned=H),
    "ios.dynamic_analyzer": _a("ios/dynamic_analyzer", "view"),
    "ios.run_app": _a("ios/run_app", "execute"),
    "ios.stop_app": _a("ios/stop_app", "execute"),
    "ios.remove_app": _a("ios/remove_app", "execute"),
    "ios.take_screenshot": _a("ios/take_screenshot", "execute"),
    "ios.get_app_container_path": _a("ios/get_app_container_path", "view"),
    "ios.network_capture": _a("ios/network_capture", "execute"),
    "ios.live_pcap_download": _a("ios/live_pcap_download", "view"),
    "ios.ssh_execute": _a("ios/ssh_execute", "execute"),
    "ios.download_app_data": _a("ios/download_app_data", "execute"),
    "ios.instance_input": _a("ios/instance_input", "execute"),
    "ios.system_logs": _a("ios/system_logs", "view"),
    "ios.file_upload": _a("ios/file_upload", "execute"),
    "ios.file_download": _a("ios/file_download", "view"),
    "dynamic.ios_report_json": _a("dynamic/ios_report_json", "view"),
    # iOS dynamic analysis (jailbroken device)
    "ios.device_dynamic_analysis": _a("ios/device_dynamic_analysis", "view"),
    "ios.device_get": _a("ios/device_get", "view"),
    "ios.device_install_ipa": _a("ios/device_install_ipa", "execute", owned=("checksum",)),
    "ios.device_dynamic_analyzer": _a("ios/device_dynamic_analyzer", "view"),
    "ios.device_file_upload": _a("ios/device_file_upload", "execute"),
    "ios.device_ssh_execute": _a("ios/device_ssh_execute", "execute"),
    "ios.device_instrument": _a("ios/device_instrument", "execute"),
    "ios.device_system_logs": _a("ios/device_system_logs", "view"),
    "ios.device_ps": _a("ios/device_ps", "view"),
    "ios.device_file_download": _a("ios/device_file_download", "view"),
    "ios.device_api_monitor": _a("ios/device_api_monitor", "view"),
    "ios.device_download_app_data": _a("ios/device_download_app_data", "execute"),
    "ios.device_report_json": _a("ios/device_report_json", "view"),
    # Static analysis extras
    "static.list_suppressions": _a("list_suppressions", "view", owned=H),
    "static.suppress_by_rule": _a("suppress_by_rule", "edit", owned=H),
    "static.suppress_by_files": _a("suppress_by_files", "edit", owned=H),
    "static.delete_suppression": _a("delete_suppression", "edit", owned=H),
    "static.tasks": _a("tasks", "view"),
}
