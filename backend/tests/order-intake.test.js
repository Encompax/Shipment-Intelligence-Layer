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
