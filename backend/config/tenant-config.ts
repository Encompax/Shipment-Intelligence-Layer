import fs from "fs";
import path from "path";

type TenantCarrier = {
  name: string;
  mode?: string;
};

type TenantItem = {
  sku: string;
  description: string;
};

type TenantConfig = {
  carriers: TenantCarrier[];
  customers: string[];
  items: TenantItem[];
  operators: string[];
  locations: string[];
};

const defaultsPath = path.join(__dirname, "tenant-defaults.json");
const defaults: TenantConfig = JSON.parse(fs.readFileSync(defaultsPath, "utf8"));

function loadOverrides(): Partial<TenantConfig> {
  const configPath = process.env.TENANT_CONFIG_PATH;
  if (!configPath) return {};

  try {
    const resolved = path.isAbsolute(configPath)
      ? configPath
      : path.join(process.cwd(), configPath);
    const raw = fs.readFileSync(resolved, "utf8");
    return JSON.parse(raw) as Partial<TenantConfig>;
  } catch (err) {
    // Fail soft — keep defaults if override cannot be loaded
    console.warn(`[tenant-config] Failed to load overrides: ${(err as Error).message}`);
    return {};
  }
}

const overrides = loadOverrides();

const tenantConfig: TenantConfig = {
  carriers: overrides.carriers && overrides.carriers.length > 0 ? overrides.carriers : defaults.carriers,
  customers: overrides.customers && overrides.customers.length > 0 ? overrides.customers : defaults.customers,
  items: overrides.items && overrides.items.length > 0 ? overrides.items : defaults.items,
  operators: overrides.operators && overrides.operators.length > 0 ? overrides.operators : defaults.operators,
  locations: overrides.locations && overrides.locations.length > 0 ? overrides.locations : defaults.locations,
};

export function getTenantConfig(): TenantConfig {
  return tenantConfig;
}
