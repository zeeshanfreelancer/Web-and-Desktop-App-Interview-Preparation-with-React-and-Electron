import { useState } from "react";
import { FiLock, FiMessageCircle, FiUserPlus } from "react-icons/fi";
import { profileService } from "../services/profiles";

const initialForm = { name: "", email: "", password: "", plan: "free" };
const whatsappUrl = "https://wa.me/923464398285?text=Hello%20Muhammad%20Zeeshan%2C%20I%20have%20a%20question%20about%20Interview%20Prep%20subscription%20or%20payment.";

function TrialNotice() {
  return <aside className="rounded-2xl bg-gradient-to-br from-indigo-700 to-blue-600 p-6 text-white shadow-xl"><h2 className="text-xl font-bold">Start free</h2><div className="mt-5 space-y-5 text-sm"><div className="rounded-xl bg-white/15 p-4"><p className="font-semibold">10-day free trial</p><p className="mt-1 text-blue-100">Enjoy unlimited access for your first 10 days. No payment is needed to register.</p></div><div className="rounded-xl bg-white/10 p-4"><p className="font-semibold">After your trial</p><p className="mt-1 text-blue-100">Upgrade to the monthly plan for Rs. 100, or continue automatically with the free version.</p></div><p className="text-blue-100">Have a question about your trial or subscription?</p><a href={whatsappUrl} target="_blank" rel="noreferrer" className="flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-indigo-700 transition hover:bg-blue-50"><FiMessageCircle />Chat with admin on WhatsApp</a></div></aside>;
}

export default function ProfileAccess({ onSignedIn }) {
  const [mode, setMode] = useState("signIn");
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const lastAccount = localStorage.getItem("interview-last-account-email");
  const registering = mode === "register";
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(""); setMessage(""); setLoading(true);
    try {
      if (registering) {
        await profileService.register(form);
        setMessage("Account created. Your 10-day free trial is ready—sign in to get started.");
        setForm(initialForm);
        setMode("signIn");
      } else {
        onSignedIn(await profileService.authenticate(form.email, form.password));
      }
    } catch (err) { setError(err.message || "Unable to continue."); } finally { setLoading(false); }
  };

  const accountForm = <form onSubmit={submit} className="w-full rounded-2xl bg-white p-7 shadow-xl"><div className="flex items-center gap-3"><FiLock className="text-2xl text-blue-600" /><div><h1 className="text-2xl font-bold text-gray-900">{registering ? "Register" : "Sign in"}</h1><p className="text-sm text-gray-600">{registering ? "Create your account and start the 10-day free trial." : "Use your account to continue."}</p></div></div>{!registering && lastAccount && <button type="button" onClick={() => update("email", lastAccount)} className="mt-5 w-full rounded-lg border border-blue-200 bg-blue-50 p-3 text-left text-sm text-blue-800">Continue with <strong>{lastAccount}</strong></button>}<div className="mt-5 space-y-4">{registering && <label className="block text-sm font-medium text-gray-700">Full name<input value={form.name} onChange={(event) => update("name", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" required /></label>}<label className="block text-sm font-medium text-gray-700">Email<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" autoFocus required /></label><label className="block text-sm font-medium text-gray-700">Password<input type="password" value={form.password} onChange={(event) => update("password", event.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2" minLength="6" required /></label></div>{message && <p className="mt-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{message}</p>}{error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={loading} className="mt-5 w-full rounded-lg bg-blue-600 py-2.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50">{registering ? <><FiUserPlus className="mr-2 inline" />{loading ? "Creating account..." : "Create account"}</> : loading ? "Signing in..." : "Sign in"}</button><button type="button" onClick={() => { setMode(registering ? "signIn" : "register"); setError(""); setMessage(""); }} className="mt-4 w-full text-sm font-medium text-blue-700 hover:underline">{registering ? "Already have an account? Sign in" : "Need access? Create an account"}</button>{!registering && <a href={whatsappUrl} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-center gap-2 text-sm font-medium text-green-700 hover:underline"><FiMessageCircle />Chat with admin about payment or subscription</a>}</form>;

  return <div className="min-h-screen bg-blue-100 p-4"><div className={`mx-auto grid min-h-[calc(100vh-2rem)] max-w-5xl items-center gap-8 ${registering ? "lg:grid-cols-2" : "max-w-md"}`}><div>{accountForm}</div>{registering && <TrialNotice />}</div></div>;
}
