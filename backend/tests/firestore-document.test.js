const test = require("node:test");
const assert = require("node:assert/strict");

const { omitUndefinedFields } = require("../dist/src/lib/firestoreDocument");

test("Firestore records omit optional lane fields that do not apply", () => {
  const linehaul = omitUndefinedFields({
    laneType: "LINEHAUL",
    terminalArrivalStart: "08:00",
    terminalArrivalEnd: "10:00",
    storeDeliveryDays: undefined,
    notes: undefined,
  });

  assert.deepEqual(linehaul, {
    laneType: "LINEHAUL",
    terminalArrivalStart: "08:00",
    terminalArrivalEnd: "10:00",
  });
  assert.equal(Object.values(linehaul).includes(undefined), false);
});

test("Firestore records retain false, zero, empty strings, and null", () => {
  const record = omitUndefinedFields({ enabled: false, capacity: 0, label: "", value: null, omitted: undefined });
  assert.deepEqual(record, { enabled: false, capacity: 0, label: "", value: null });
});
