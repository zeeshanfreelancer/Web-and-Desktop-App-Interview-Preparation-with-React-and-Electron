import { useState } from "react";
import { FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { profileService } from "../services/profiles";

const blankClient = { name: "", username: "", password: "" };

export default function ProfileModal({ user, onClose, onUserUpdated }) {
  const [clients, setClients] = useState(() => profileService.getProfiles().filter((profile) => profile.role === "client"));
  const [client, setClient] = useState(blankClient);
  const [password, setPassword] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");

  const refreshClients = () => setClients(profileService.getProfiles().filter((profile) => profile.role === "client"));
  const saveOwnPassword = async (event) => { event.preventDefault(); try { onUserUpdated(await profileService.updateProfile(user.id, { password })); setPassword(""); } catch (err) { setError(err.message); } };
  const addClient = async (event) => { event.preventDefault(); try { await profileService.createProfile(client); setClient(blankClient); refreshClients(); } catch (err) { setError(err.message); } };
  const updateClientPassword = async (event) => { event.preventDefault(); try { await profileService.updateProfile(selectedId, { password }); setPassword(""); refreshClients(); } catch (err) { setError(err.message); } };
  const removeClient = (id) => { if (window.confirm("Delete this client profile and its local question data?")) { profileService.deleteClient(id); localStorage.removeItem(`interview-questions:${id}`); localStorage.removeItem(`interview-languages:${id}`); refreshClients(); } };

  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl p-6">
    <div className="flex items-start justify-between gap-4 border-b pb-4"><div><h2 className="text-xl font-bold">{user.role === "admin" ? "Admin Profile" : "Client Profile"}</h2><p className="text-sm text-gray-600">Signed in as {user.name} ({user.username})</p></div><button onClick={onClose} className="p-1 text-gray-500 hover:text-gray-800"><FiX size={22} /></button></div>
    {error && <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={saveOwnPassword} className="mt-5 rounded-xl border p-4"><h3 className="font-semibold">Update {user.role === "admin" ? "admin" : "your"} password</h3><div className="mt-3 flex gap-2"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New password" className="min-w-0 flex-1 rounded border px-3 py-2" required /><button className="rounded bg-purple-600 px-4 text-white">Update</button></div></form>
    {user.role === "admin" && <div className="mt-6 space-y-6"><form onSubmit={addClient} className="rounded-xl border p-4"><h3 className="font-semibold">Add client profile</h3><div className="mt-3 grid gap-2 sm:grid-cols-3"><input value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} placeholder="Client name" className="rounded border px-3 py-2" required /><input value={client.username} onChange={(e) => setClient({ ...client, username: e.target.value })} placeholder="Username" className="rounded border px-3 py-2" required /><input type="password" value={client.password} onChange={(e) => setClient({ ...client, password: e.target.value })} placeholder="Password" className="rounded border px-3 py-2" required /></div><button className="mt-3 rounded bg-green-600 px-4 py-2 text-white"><FiPlus className="mr-1 inline" />Add client</button></form>
      <section><h3 className="font-semibold">Client details ({clients.length})</h3><div className="mt-3 space-y-2">{clients.length === 0 ? <p className="text-sm text-gray-500">No clients yet.</p> : clients.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3"><div className="mr-auto"><p className="font-medium">{item.name}</p><p className="text-sm text-gray-500">{item.username} · Created {new Date(item.createdAt).toLocaleDateString()}</p></div><button onClick={() => { setSelectedId(item.id); setPassword(""); }} className={`rounded px-3 py-1.5 text-sm ${selectedId === item.id ? "bg-purple-600 text-white" : "bg-purple-100 text-purple-700"}`}>Change password</button><button onClick={() => removeClient(item.id)} className="rounded p-2 text-red-600 hover:bg-red-50" title="Delete client"><FiTrash2 /></button></div>)}</div>
      {selectedId && <form onSubmit={updateClientPassword} className="mt-3 flex gap-2"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="New client password" className="min-w-0 flex-1 rounded border px-3 py-2" required /><button className="rounded bg-purple-600 px-4 text-white">Save password</button></form>}</section>
    </div>}
  </div></div>;
}
