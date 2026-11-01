import { useState } from "react";
import { FiLock, FiUser } from "react-icons/fi";
import { profileService } from "../services/profiles";

export default function ProfileAccess({ needsSetup, onSignedIn }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError(""); setLoading(true);
    try {
      const profile = needsSetup
        ? await profileService.createAdmin({ name, username, password })
        : await profileService.authenticate(username, password);
      onSignedIn(profile, needsSetup);
    } catch (err) {
      setError(err.message || "Unable to continue.");
    } finally { setLoading(false); }
  };

  return <div className="min-h-screen bg-blue-100 flex items-center justify-center p-4"><form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white shadow-lg p-8 space-y-4">
    <div className="flex items-center gap-3"><FiLock className="text-blue-600 text-2xl" /><div><h1 className="text-2xl font-bold">{needsSetup ? "Create Admin Profile" : "Sign in"}</h1><p className="text-sm text-gray-600">{needsSetup ? "Set up the administrator for this installation." : "Use your admin or client account."}</p></div></div>
    {needsSetup && <label className="block text-sm font-medium">Name<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" required /></label>}
    <label className="block text-sm font-medium">Username<input value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" autoFocus required /></label>
    <label className="block text-sm font-medium">Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" required /></label>
    {error && <p className="text-sm text-red-600">{error}</p>}
    <button disabled={loading} className="w-full rounded-lg bg-blue-600 py-2.5 text-white font-medium disabled:opacity-50"><FiUser className="inline mr-2" />{loading ? "Please wait..." : needsSetup ? "Create Admin" : "Sign in"}</button>
  </form></div>;
}
