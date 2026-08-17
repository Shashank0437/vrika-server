"""Shared constants for Redis keys."""

REG_COMPLETE_REDIS_PREFIX = "vrika:reg_complete:"
ORG_INVITE_REDIS_PREFIX = "vrika:org_invite:"
SAML_RELAY_REDIS_PREFIX = "vrika:saml_relay:"

SSO_CONFIGS_COLLECTION = "sso_configs"

ORG_TOOL_POLICY_COLLECTION = "organization_tool_policy"
TOOL_EXECUTION_LOG_COLLECTION = "tool_execution_log"

AGENT_CHAT_SESSIONS_COLLECTION = "agent_chat_sessions"
AGENT_CHAT_MESSAGES_COLLECTION = "agent_chat_messages"
AGENT_CHAT_ATTACHMENTS_COLLECTION = "agent_chat_attachments"

ALWAYS_DISABLE_CATEGORIES = frozenset({"wifi_pentest", "cloud"})
ALWAYS_DISABLE_TOOLS = frozenset({
    # wifi_pentest
    "aircrack_ng",
    "airmon_ng",
    "airodump_ng",
    "aireplay_ng",
    "airbase_ng",
    "airdecap_ng",
    "hcxpcapngtool",
    "hcxdumptool",
    "eaphammer",
    "wifite2",
    "bettercap_wifi",
    "mdk4",
    # cloud
    "pacu",
    "cloudmapper",
    "prowler",
    "trivy",
    "kube-hunter",
    "scout-suite",
    "clair",
    "docker-bench-security",
    "checkov",
    "terrascan",
    "kube-bench",
    "falco"
})

MAX_TOOL_RUN_REQUEST_SNAPSHOT = 32 * 1024
MAX_TOOL_RUN_RESPONSE_RAW = 64 * 1024
MAX_TOOL_RUN_STDOUT_STORE = 32 * 1024
MAX_TOOL_RUN_STDERR_STORE = 32 * 1024
