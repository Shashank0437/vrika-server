export type BrandingOut = {
  has_custom_logo: boolean;
  logo_filename: string;
  logo_content_type: string;
  logo: string | null;
  updated_at: string | null;
};

/**
 * Payload of `GET /org/settings`. Extend this as new configuration groups are
 * added to the central config store (e.g. `smtp`).
 */
export type OrgSettingsOut = {
  branding: BrandingOut;
};
