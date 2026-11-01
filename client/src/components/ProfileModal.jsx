import { useCallback, useEffect, useState } from "react";
import { FiCheck, FiRefreshCw, FiShield, FiUser, FiX } from "react-icons/fi";
import { profileService } from "../services/profiles";

const date = (value) => value ? new Date(value).toLocaleString() : "—";

export default function ProfileModal({ user, initialView, onClose, onUserUpdated, onSignOut }) {
  const isAdmin = user.role === "admin";
  const [view, setView] = useState(initialView === "admin" && isAdmin ? "admin" : "user");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true); setError("");
    try { setRequests(await profileService.getRequests()); } catch (err) { setError(err.message || "Could not load requests."); } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { if (view === "admin") loadRequests(); }, [view, loadRequests]);

  const review = async (request, status) => {
    setError("");
    try { await profileService.reviewRequest(request.id, status); await loadRequests(); } catch (err) { setError(err.message || "Could not update the request."); }
  };

  const requestUpgrade = async (plan) => {
    setError("");
    try { onUserUpdated(await profileService.requestUpgrade(plan)); } catch (err) { setError(err.message || "Could not request an upgrade."); }
  };

  const signOut = async () => {
    try { await profileService.signOut(); onSignOut(); } catch (err) { setError(err.message || "Could not sign out."); }
  };

  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl">
    <div className="flex items-start justify-between gap-4 border-b p-6"><div><h2 className="text-xl font-bold">Account dashboard</h2><p className="text-sm text-gray-600">{user.name} · {user.email}</p></div><button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800" aria-label="Close"><FiX size={22} /></button></div>
    <div className="flex gap-2 border-b px-6 pt-4"><button onClick={() => setView("user")} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${view === "user" ? "bg-blue-50 text-blue-700" : "text-gray-600"}`}><FiUser className="mr-1 inline" />User profile</button>{isAdmin && <button onClick={() => setView("admin")} className={`rounded-t-lg px-4 py-2 text-sm font-medium ${view === "admin" ? "bg-blue-50 text-blue-700" : "text-gray-600"}`}><FiShield className="mr-1 inline" />Admin dashboard</button>}</div>
    <div className="p-6">{error && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {view === "user" ? <section className="space-y-4"><h3 className="font-semibold">Your profile</h3><dl className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Role</dt><dd className="font-medium capitalize">{user.role}</dd></div><div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Current plan</dt><dd className="font-medium capitalize">{user.plan}</dd></div><div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Access status</dt><dd className="font-medium capitalize text-green-700">{user.approvalStatus}</dd></div><div className="rounded-lg bg-gray-50 p-3"><dt className="text-xs text-gray-500">Registered</dt><dd className="font-medium">{date(user.createdAt)}</dd></div></dl>
        {user.plan === "free" && !isAdmin && <div className="rounded-xl border border-blue-100 bg-blue-50 p-4"><h4 className="font-semibold text-blue-900">Upgrade your plan</h4><p className="mt-1 text-sm text-blue-800">Free accounts can use 2 languages and 10 questions per language. Upgrade requests need administrator approval.</p>{user.requestedPlan ? <p className="mt-3 text-sm font-medium text-amber-800">{user.requestedPlan} upgrade request pending.</p> : <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => requestUpgrade("monthly")} className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white">Upgrade monthly</button><button onClick={() => requestUpgrade("yearly")} className="rounded border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700">Upgrade yearly</button></div>}</div>}
        <p className="text-sm text-gray-500">Plan selection is recorded only; billing is not enabled.</p><button onClick={signOut} className="rounded bg-gray-800 px-4 py-2 text-sm font-medium text-white">Sign out</button></section> : <section><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Access requests</h3><p className="text-sm text-gray-500">Approve or reject paid registrations and free-plan upgrades. You can change a previous decision at any time.</p></div><button onClick={loadRequests} disabled={loading} className="rounded border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"><FiRefreshCw className={`mr-1 inline ${loading ? "animate-spin" : ""}`} />Refresh</button></div><div className="space-y-3">{requests.length === 0 && !loading ? <p className="rounded bg-gray-50 p-4 text-sm text-gray-500">No user requests yet.</p> : requests.map((request) => { const pendingUpgrade = request.approvalStatus === "approved" && request.requestedPlan; const pending = request.approvalStatus === "pending" || pendingUpgrade; return <div key={request.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4"><div className="mr-auto min-w-48"><p className="font-medium">{request.name}</p><p className="text-sm text-gray-500">{request.email} · {pendingUpgrade ? `Upgrade to ${request.requestedPlan}` : request.plan} · requested {date(request.createdAt)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${pending ? "bg-amber-100 text-amber-800" : request.approvalStatus === "rejected" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>{pending ? "pending" : request.approvalStatus}</span><button onClick={() => review(request, "approved")} className="rounded bg-green-600 px-3 py-1.5 text-sm text-white"><FiCheck className="mr-1 inline" />Approve</button><button onClick={() => review(request, "rejected")} className="rounded bg-red-600 px-3 py-1.5 text-sm text-white">Reject</button></div>; })}</div></section>}
    </div>
  </div></div>;
}
