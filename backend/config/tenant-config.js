"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTenantConfig = getTenantConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const defaultsPath = path_1.default.join(__dirname, "tenant-defaults.json");
const defaults = JSON.parse(fs_1.default.readFileSync(defaultsPath, "utf8"));
function loadOverrides() {
    const configPath = process.env.TENANT_CONFIG_PATH;
    if (!configPath)
        return {};
    try {
        const resolved = path_1.default.isAbsolute(configPath)
            ? configPath
            : path_1.default.join(process.cwd(), configPath);
        const raw = fs_1.default.readFileSync(resolved, "utf8");
        return JSON.parse(raw);
    }
    catch (err) {
        // Fail soft — keep defaults if override cannot be loaded
        console.warn(`[tenant-config] Failed to load overrides: ${err.message}`);
        return {};
    }
}
const overrides = loadOverrides();
const tenantConfig = {
    carriers: overrides.carriers && overrides.carriers.length > 0 ? overrides.carriers : defaults.carriers,
    customers: overrides.customers && overrides.customers.length > 0 ? overrides.customers : defaults.customers,
    items: overrides.items && overrides.items.length > 0 ? overrides.items : defaults.items,
    operators: overrides.operators && overrides.operators.length > 0 ? overrides.operators : defaults.operators,
    locations: overrides.locations && overrides.locations.length > 0 ? overrides.locations : defaults.locations,
};
function getTenantConfig() {
    return tenantConfig;
}
