const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalizeOrder, inferOrderMapping, orderDuplicateKey, validateOrder } = require('../dist/src/routes/orders');

test('GoPuff compiler headers map into the canonical order model', () => {
  const headers = ['Action', 'Primary reference', 'PO Number', 'material transfer order number', 'MEID', 'Business Unit', 'Earliest Pickup', 'Latest Delivery', 'Origin ID', 'Destination ID', 'Quantity', 'Weight', 'SCAC'];
  const mapping = inferOrderMapping(headers);
  const order = canonicalizeOrder({ Action: 'create', 'Primary reference': 'GUSTO-100', 'PO Number': 'GUS-200', MEID: 'M-3', 'Business Unit': 'Gopuff', 'Earliest Pickup': '2026-10-12T08:00', 'Latest Delivery': '2026-10-13T12:00', 'Origin ID': 'DC1', 'Destination ID': 'MFC9', Quantity: '12', Weight: '900', SCAC: 'WARP' }, mapping);
  assert.equal(order.primaryReference, 'GUSTO-100');
  assert.equal(order.originId, 'DC1');
  assert.equal(order.quantity, 12);
  assert.equal(validateOrder(order, 2).filter((issue) => issue.severity === 'ERROR').length, 0);
});

test('order duplicate identity normalizes reference formatting', () => {
  const first = orderDuplicateKey({ primaryReference: 'GUSTO-100', poNumber: 'GUS 200', meid: 'M-3' });
  const second = orderDuplicateKey({ primaryReference: 'gusto 100', poNumber: 'gus-200', meid: 'm3' });
  assert.equal(first, second);
});

test('one order retains each, case, and pallet quantities together', () => {
  const mapping = inferOrderMapping(['Primary reference', 'Origin ID', 'Destination ID', 'Earliest Pickup', 'Latest Delivery', 'Each Quantity', 'Case Quantity', 'Pallet Quantity']);
  const order = canonicalizeOrder({ 'Primary reference': 'GUSTO-300', 'Origin ID': 'DC1', 'Destination ID': 'MFC1', 'Earliest Pickup': '2026-10-13T08:00', 'Latest Delivery': '2026-10-14T08:00', 'Each Quantity': '8', 'Case Quantity': '24', 'Pallet Quantity': '3' }, mapping);
  assert.equal(order.eachQuantity, 8);
  assert.equal(order.caseQuantity, 24);
  assert.equal(order.palletQuantity, 3);
});

test('rejects reversed pickup and delivery chronology', () => {
  const base = { primaryReference: 'GUSTO-400', originId: 'DC1', destinationId: 'MFC1', earliestPickup: '2026-10-14T12:00', latestDelivery: '2026-10-14T10:00' };
  assert.ok(validateOrder(base, 1).some((issue) => issue.code === 'DELIVERY_BEFORE_PICKUP'));
  assert.ok(validateOrder({ ...base, latestDelivery: '2026-10-15T10:00', latestPickup: '2026-10-14T11:00' }, 1).some((issue) => issue.code === 'PICKUP_WINDOW_REVERSED'));
  assert.ok(validateOrder({ ...base, latestDelivery: '2026-10-15T10:00', earliestDelivery: '2026-10-15T12:00' }, 1).some((issue) => issue.code === 'DELIVERY_WINDOW_REVERSED'));
});

test('rejects invalid order date values', () => {
  const issues = validateOrder({ primaryReference: 'GUSTO-500', originId: 'DC1', destinationId: 'MFC1', earliestPickup: 'not-a-date', latestDelivery: '2026-10-15T10:00' }, 1);
  assert.ok(issues.some((issue) => issue.field === 'earliestPickup' && issue.code === 'INVALID_DATETIME'));
});
