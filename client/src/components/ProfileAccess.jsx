import { useState } from "react";
import { FiLock, FiUserPlus } from "react-icons/fi";
import { profileService } from "../services/profiles";

const initialForm = { name: "", email: "", password: "", plan: "monthly" };

export default function ProfileAccess({ onSignedIn }) {
  const [mode, setMode] = useState("signIn");
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const registering = mode === "register";

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    setError(""); setMessage(""); setLoading(true);
    try {
      if (registering) {
        await profileService.register(form);
        setMessage("Request submitted. The administrator must approve it before you can sign in.");
        setForm(initialForm);
        setMode("signIn");
      } else {
        onSignedIn(await profileService.authenticate(form.email, form.password));
      }
    } catch (err) {
      setError(err.message || "Unable to continue.");
    } finally { setLoading(false); }
  };

  return <div className="min-h-screen bg-blue-100 flex items-center justify-center p-4"><form onSubmit={submit} className="w-full max-w-md rounded-xl bg-white shadow-lg p-8 space-y-4">
    <div className="flex items-center gap-3"><FiLock className="text-blue-600 text-2xl" /><div><h1 className="text-2xl font-bold">{registering ? "Request access" : "Sign in"}</h1><p className="text-sm text-gray-600">{registering ? "Choose a plan and send your request for approval." : "Use your approved account to continue."}</p></div></div>
    {registering && <label className="block text-sm font-medium">Full name<input value={form.name} onChange={(e) => update("name", e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" required /></label>}
    <label className="block text-sm font-medium">Email<input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" autoFocus required /></label>
    <label className="block text-sm font-medium">Password<input type="password" value={form.password} onChange={(e) => update("password", e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2" minLength="6" required /></label>
    {registering && <label className="block text-sm font-medium">Subscription plan<select value={form.plan} onChange={(e) => update("plan", e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2"><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select><span className="mt-1 block text-xs font-normal text-gray-500">Plan choice is recorded only; payment is not processed yet.</span></label>}
    {message && <p className="rounded bg-green-50 p-3 text-sm text-green-700">{message}</p>}
    {error && <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <button disabled={loading} className="w-full rounded-lg bg-blue-600 py-2.5 text-white font-medium disabled:opacity-50">{registering ? <><FiUserPlus className="inline mr-2" />{loading ? "Sending..." : "Send request"}</> : loading ? "Signing in..." : "Sign in"}</button>
    <button type="button" onClick={() => { setMode(registering ? "signIn" : "register"); setError(""); setMessage(""); }} className="w-full text-sm font-medium text-blue-700 hover:underline">{registering ? "Already approved? Sign in" : "Need access? Request an account"}</button>
  </form></div>;
}
