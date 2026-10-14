export type EquipmentCapacityRule = {
  equipmentType: "BOX TRUCK" | "26 FT DRY VAN" | "53 FT DRY VAN";
  maxWeightLbs: number;
  maxPallets: number;
};

export const EQUIPMENT_CAPACITY_POLICY_VERSION = "2026-10-13.1";

export const EQUIPMENT_CAPACITY_RULES: Record<EquipmentCapacityRule["equipmentType"], EquipmentCapacityRule> = {
  "BOX TRUCK": { equipmentType: "BOX TRUCK", maxWeightLbs: 10_000, maxPallets: 10 },
  "26 FT DRY VAN": { equipmentType: "26 FT DRY VAN", maxWeightLbs: 12_000, maxPallets: 12 },
  "53 FT DRY VAN": { equipmentType: "53 FT DRY VAN", maxWeightLbs: 45_000, maxPallets: 30 },
};

const normalize = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");

export function getEquipmentCapacityRule(equipmentType: unknown) {
  return EQUIPMENT_CAPACITY_RULES[normalize(equipmentType) as EquipmentCapacityRule["equipmentType"]] ?? null;
}

export function weightInPounds(weight: unknown, weightUom: unknown) {
  if (weight === "" || weight === null || weight === undefined) return null;
  const amount = Number(weight);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return normalize(weightUom) === "KG" ? amount * 2.2046226218 : amount;
}
