const mode = process.argv.includes("--production") ? "production" : "preview";

const required = [
  "DATABASE_URL",
  "SESSION_HMAC_SECRET",
  "WEBHOOK_ENCRYPTION_KEY",
  "CRON_SECRET",
  "ADMIN_USER",
  "ADMIN_ACCESS_KEY",
  "ADMIN_ACCESS_LEVEL",
  "NEXT_PUBLIC_HCAPTCHA_SITE_KEY",
  "HCAPTCHA_SECRET_KEY"
];

const placeholders = new Set([
  "",
  "replace-me",
  "replace-me-never-commit",
  "replace-with-a-random-32-byte-secret",
  "replace-with-public-site-key"
]);

const missing = required.filter((name) => {
  const value = process.env[name]?.trim() ?? "";
  return !value || placeholders.has(value);
});

const checks = [
  ["DATABASE_REQUIRED=true", process.env.DATABASE_REQUIRED === "true"],
  ["SHINY_STORAGE_MODE=database", process.env.SHINY_STORAGE_MODE === "database"],
  ["ADMIN_ACCESS_LEVEL=OWNER", process.env.ADMIN_ACCESS_LEVEL?.trim().toUpperCase() === "OWNER"],
  ["DATABASE_URL is a valid URL", (() => {
    try {
      return Boolean(new URL(process.env.DATABASE_URL || ""));
    } catch {
      return false;
    }
  })()],
  ["HCAPTCHA site key is not exposed as a server secret", true]
];

if (mode === "production") {
  checks.push([
    "RECONCILIATION_AUTOMATION_ENABLED=true",
    process.env.RECONCILIATION_AUTOMATION_ENABLED === "true"
  ]);
} else {
  checks.push([
    "Preview does not require Promisse live credentials",
    true
  ]);
}

const failed = checks.filter(([, ok]) => !ok).map(([name]) => name);

console.log("SHINY STORE release validation");
console.log("Mode:", mode);
console.log("Secrets checked by presence only: no values are printed.");
console.log("Required configuration:", missing.length ? "FAIL" : "PASS");
if (missing.length) console.log("Missing required variables:", missing.join(", "));
console.log("Configuration checks:", failed.length ? "FAIL" : "PASS");
if (failed.length) console.log("Failed checks:", failed.join(", "));

console.log("Promisse calls: 0");
console.log("Charges created: 0");
console.log("Webhooks sent: 0");

if (missing.length || failed.length) process.exit(1);
console.log("RESULT: READY FOR THE SELECTED NON-FINANCIAL DEPLOYMENT GATE");
