const test = require('node:test');
const assert = require('node:assert/strict');
const { EQUIPMENT_CAPACITY_RULES, getEquipmentCapacityRule, weightInPounds } = require('../dist/src/services/equipmentCapacity');

test('defines the initial customer equipment limits', () => {
  assert.deepEqual(EQUIPMENT_CAPACITY_RULES['BOX TRUCK'], { equipmentType: 'BOX TRUCK', maxWeightLbs: 10000, maxPallets: 10 });
  assert.deepEqual(EQUIPMENT_CAPACITY_RULES['26 FT DRY VAN'], { equipmentType: '26 FT DRY VAN', maxWeightLbs: 12000, maxPallets: 12 });
  assert.deepEqual(EQUIPMENT_CAPACITY_RULES['53 FT DRY VAN'], { equipmentType: '53 FT DRY VAN', maxWeightLbs: 45000, maxPallets: 30 });
  assert.equal(getEquipmentCapacityRule('53 ft dry van').maxPallets, 30);
});

test('normalizes pounds and converts kilograms for capacity checks', () => {
  assert.equal(weightInPounds(10000, 'LBS'), 10000);
  assert.ok(Math.abs(weightInPounds(1000, 'KG') - 2204.6226218) < 0.0001);
});
