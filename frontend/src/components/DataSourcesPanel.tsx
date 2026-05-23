import { useEffect, useState } from "react";
import { fetchDatasources, createDatasource } from "../api/client";
export default function DataSourcesPanel() {
 const [items, setItems] = useState<any[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [name, setName] = useState("");
 const [type, setType] = useState("");
 const [description, setDescription] = useState("");
 async function load() {
   try {
     const data = await fetchDatasources();
     setItems(data);
     setError(null);
   } catch (err: any) {
     setError(err.message);
   } finally {
     setLoading(false);
   }
 }
 useEffect(() => {
   load();
 }, []);
 async function handleCreate(e: React.FormEvent) {
   e.preventDefault();
   if (!name || !type) return;
   await createDatasource({ name, type, description });
   setName("");
   setType("");
   setDescription("");
   load();
 }
 if (loading) return <div>Loading datasources…</div>;
 if (error) return <div>Error: {error}</div>;
 return (
<section style={{ padding: "20px" }}>
<h2>Datasources</h2>
<form onSubmit={handleCreate} style={{ marginBottom: "20px" }}>
<input
         id="ds-name"
         name="ds-name"
         placeholder="Name"
         value={name}
         onChange={(e) => setName(e.target.value)}
       />
<input
         id="ds-type"
         name="ds-type"
         placeholder="Type"
         value={type}
         onChange={(e) => setType(e.target.value)}
       />
<input
         id="ds-description"
         name="ds-description"
         placeholder="Description"
         value={description}
         onChange={(e) => setDescription(e.target.value)}
       />
<button type="submit">Add</button>
</form>
<table border={1} cellPadding={6}>
<thead>
<tr>
<th>Name</th>
<th>Type</th>
<th>Description</th>
<th>Created</th>
</tr>
</thead>
<tbody>
         {items.map((ds) => (
<tr key={ds.id}>
<td>{ds.name}</td>
<td>{ds.type}</td>
<td>{ds.description}</td>
<td>{new Date(ds.createdAt).toLocaleString()}</td>
</tr>
         ))}
</tbody>
</table>
</section>
 );
}