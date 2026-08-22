export type BrandingOut = {
  has_custom_logo: boolean;
  logo_filename: string;
  logo_content_type: string;
  logo: string | null;
  updated_at: string | null;
};

export type LlmProviderType = "openrouter" | "openai" | "anthropic" | "gemini" | "custom";

export type LlmProviderConfigOut = {
  has_api_key: boolean;
  base_url: string;
  model: string;
  temperature: number;
  max_tokens: number;
  context_limit?: number | null;
};

export type LlmSettingsOut = {
  active_provider: LlmProviderType;
  providers: Partial<Record<LlmProviderType, LlmProviderConfigOut>>;
  updated_at: string | null;
};

export type ModelOption = {
  id: string;
  name: string;
  context_length?: number | null;
};

export type FetchModelsOut = {
  models: ModelOption[];
};

export type TestLlmConnectionOut = {
  success: boolean;
  message: string;
  latency_ms: number;
  response_preview?: string;
};

export type SsoSettingsIn = {
  enabled: boolean;
  enforced: boolean;
  domain: string;
  idp_entity_id: string;
  idp_sso_url: string;
  idp_x509_cert: string;
};

export type SsoSettingsOut = {
  enabled: boolean;
  enforced: boolean;
  domain: string;
  idp_entity_id: string;
  idp_sso_url: string;
  has_idp_cert: boolean;
  idp_x509_cert: string;
  sp_entity_id: string;
  sp_acs_url: string;
  sp_metadata_url: string;
  updated_at: string | null;
};

/**
 * Payload of `GET /org/settings`.
 */
export type OrgSettingsOut = {
  branding: BrandingOut;
  llm: LlmSettingsOut;
  sso?: SsoSettingsOut;
};
