const REQUIRED_PRODUCTION_VARS = [
  "DATABASE_URL",
  "SESSION_HMAC_SECRET",
  "WEBHOOK_ENCRYPTION_KEY",
  "CRON_SECRET",
  "ADMIN_USER",
  "ADMIN_ACCESS_KEY",
  "ADMIN_ACCESS_LEVEL",
  "NEXT_PUBLIC_HCAPTCHA_SITE_KEY",
  "HCAPTCHA_SECRET_KEY",
  "RECONCILIATION_AUTOMATION_ENABLED"
] as const;

const PLACEHOLDER_VALUES = new Set([
  "",
  "replace-me",
  "replace-me-never-commit",
  "replace-with-a-random-32-byte-secret",
  "replace-with-public-site-key"
]);

function configured(name: string) {
  const value = process.env[name]?.trim() ?? "";
  return Boolean(value) && !PLACEHOLDER_VALUES.has(value);
}

export function missingProductionConfiguration(): string[] {
  if (process.env.NODE_ENV !== "production") return [];

  const missing = REQUIRED_PRODUCTION_VARS.filter((name) => !configured(name));

  if (process.env.ADMIN_ACCESS_LEVEL?.trim().toUpperCase() !== "OWNER") {
    if (!missing.includes("ADMIN_ACCESS_LEVEL")) missing.push("ADMIN_ACCESS_LEVEL");
  }

  if (process.env.RECONCILIATION_AUTOMATION_ENABLED !== "true") {
    if (!missing.includes("RECONCILIATION_AUTOMATION_ENABLED")) {
      missing.push("RECONCILIATION_AUTOMATION_ENABLED");
    }
  }

  return missing;
}

export function productionConfigurationReady() {
  return missingProductionConfiguration().length === 0;
}
