// frontend/src/components/PickingTemplatePanel.tsx

import { useEffect, useState } from "react";

interface PickingRow {

  orderNumber: string;

  itemNumber: string;

  description: string;

  qtyToPick: number;

  location: string;

  barcodeValue: string;

}

export function PickingTemplatePanel() {

  const [rows, setRows] = useState<PickingRow[]>([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);

  async function loadPlan() {

    try {

      setLoading(true);

      setError(null);

      const res = await fetch("/api/picking/plan"); 

      // If you’re not proxying /api → backend, change to full backend URL

      if (!res.ok) {

        throw new Error(`HTTP ${res.status}`);

      }

      const data = (await res.json()) as PickingRow[];

      setRows(data);

    } catch (e: any) {

      setError(e.message ?? "Failed to load picking plan");

    } finally {

      setLoading(false);

    }

  }

  useEffect(() => {

    loadPlan();

  }, []);

  return (
<div>
<h2>Multi-Order Picking Template</h2>
<button onClick={loadPlan}>Refresh Plan</button>

      {loading && <div>Loading…</div>}

      {error && <div style={{ color: "red" }}>{error}</div>}

      {!loading && !error && rows.length > 0 && (
<table>
<thead>
<tr>
<th>Order #</th>
<th>Item #</th>
<th>Description</th>
<th>Qty</th>
<th>Location</th>
<th>Barcode</th>
</tr>
</thead>
<tbody>

            {rows.map((row, idx) => (
<tr key={idx}>
<td>{row.orderNumber}</td>
<td>{row.itemNumber}</td>
<td>{row.description}</td>
<td>{row.qtyToPick}</td>
<td>{row.location}</td>
<td>{row.barcodeValue}</td>
</tr>

            ))}
</tbody>
</table>

      )}

      {!loading && !error && rows.length === 0 && (
<div>No picking rows found.</div>

      )}
</div>

  );

}
 