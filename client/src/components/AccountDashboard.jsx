import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCamera, FiCheck, FiClock, FiCreditCard, FiRefreshCw, FiShield, FiUser, FiUsers } from "react-icons/fi";
import { profileService } from "../services/profiles";
import { workspaceSync } from "../services/workspaceSync";
import AdminUserDetails from "./AdminUserDetails";

const formatDate = (value) => value ? new Date(value).toLocaleString() : "Not yet";

function remainingTime(expiresAt, now) {
  if (!expiresAt) return "No expiry set";
  let time = new Date(expiresAt).getTime() - now;
  if (time <= 0) return "Expired";
  let days = Math.floor(time / 86_400_000);
  time -= days * 86_400_000;
  const hours = Math.floor(time / 3_600_000);
  time -= hours * 3_600_000;
  const minutes = Math.floor(time / 60_000);
  const years = Math.floor(days / 365);
  days -= years * 365;
  const months = Math.floor(days / 30);
  days -= months * 30;
  return `${years}y ${months}mo ${days}d ${hours}h ${minutes}m`;
}

export default function AccountDashboard({ user, onUserUpdated, onSignOut }) {
  const isAdmin = user.role === "admin";
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarInputRef = useRef(null);

  const loadRequests = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true); setError("");
    try { setRequests(await profileService.getRequests()); } catch (err) { setError(err.message || "Could not load access requests."); } finally { setLoading(false); }
  }, [isAdmin]);

  useEffect(() => { loadRequests(); }, [loadRequests]);
  useEffect(() => {
    if (!isAdmin) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [isAdmin]);

  const summary = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((item) => item.approvalStatus === "pending" || item.requestedPlan).length,
    approved: requests.filter((item) => item.approvalStatus === "approved" && !item.requestedPlan).length
  }), [requests]);

  const review = async (request, approvalStatus) => {
    setError("");
    try { await profileService.reviewRequest(request.id, approvalStatus); await loadRequests(); } catch (err) { setError(err.message || "Could not update this request."); }
  };
  const upgrade = async (plan) => {
    setError("");
    try { onUserUpdated(await profileService.requestUpgrade(plan)); } catch (err) { setError(err.message || "Could not request an upgrade."); }
  };
  const signOut = async () => {
    try { await workspaceSync.syncNow(); await profileService.signOut(); onSignOut(); } catch (err) { setError(err.message || "Could not sign out."); }
  };
  const syncNow = async () => {
    if (!navigator.onLine) { setSyncMessage("You are offline. Your changes remain saved on this device and will sync when you reconnect."); return; }
    setSyncing(true); setSyncMessage("");
    try { const saved = await workspaceSync.syncNow(); setSyncMessage(saved ? "Workspace synced successfully." : "Sync is waiting. Please try again in a moment."); } finally { setSyncing(false); }
  };
  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(""); setUploadingAvatar(true);
    try { onUserUpdated(await profileService.uploadAvatar(file)); } catch (err) { setError(err.message || "Could not upload profile picture."); } finally { setUploadingAvatar(false); }
  };
  const removeAvatar = async () => {
    if (!window.confirm("Remove your profile picture?")) return;
    setError(""); setUploadingAvatar(true);
    try { onUserUpdated(await profileService.removeAvatar()); setAvatarMenuOpen(false); } catch (err) { setError(err.message || "Could not remove profile picture."); } finally { setUploadingAvatar(false); }
  };

  return <div className="space-y-6" onClickCapture={(event) => { const avatarButton = event.target.closest?.('[title="Change profile picture"]'); if (avatarButton) { event.preventDefault(); event.stopPropagation(); setAvatarMenuOpen(true); } }}>
    <section className="overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 p-6 text-white shadow-lg"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-4"><button type="button" onClick={() => avatarInputRef.current?.click()} disabled={uploadingAvatar} className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full bg-white/20 ring-2 ring-white/50 disabled:opacity-60" title="Change profile picture">{user.avatarUrl ? <img src={user.avatarUrl} alt="Profile" className="h-full w-full object-cover" /> : <FiUser className="m-auto h-full w-8" />}<span className="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex"><FiCamera /></span></button><input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar} className="hidden" /><div><p className="text-sm font-medium text-blue-100">{isAdmin ? "Central administrator" : "Interview Prep account"}</p><h2 className="mt-1 text-2xl font-bold">Welcome back, {user.name}</h2><p className="mt-2 text-sm text-blue-100">{uploadingAvatar ? "Uploading picture..." : user.email}</p></div></div><span className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium capitalize">{user.role}</span></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-white/15 p-3"><p className="text-xs text-blue-100">Current plan</p><p className="mt-1 font-semibold capitalize">{user.plan}</p></div><div className="rounded-xl bg-white/15 p-3"><p className="text-xs text-blue-100">Access status</p><p className="mt-1 font-semibold capitalize">{user.approvalStatus}</p></div><div className="rounded-xl bg-white/15 p-3"><p className="text-xs text-blue-100">Member since</p><p className="mt-1 font-semibold">{new Date(user.createdAt).toLocaleDateString()}</p></div></div></section>
    {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {avatarMenuOpen && <div className="fixed inset-0 z-[90]" onClick={() => setAvatarMenuOpen(false)}><div className="absolute left-4 top-24 w-52 rounded-xl bg-white p-2 shadow-2xl" onClick={(event) => event.stopPropagation()}>{user.avatarUrl && <button type="button" onClick={() => { setAvatarMenuOpen(false); setAvatarPreviewOpen(true); }} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100">View full screen</button>}<button type="button" onClick={() => { setAvatarMenuOpen(false); avatarInputRef.current?.click(); }} className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100">Change picture</button>{user.avatarUrl && <button type="button" onClick={removeAvatar} className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50">Remove picture</button>}</div></div>}
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-gray-900">Workspace synchronization</h3><p className="mt-1 text-sm text-gray-500">{navigator.onLine ? "Online — changes sync automatically." : "Offline — changes are stored locally until you reconnect."}</p></div><button onClick={syncNow} disabled={syncing} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"><FiRefreshCw className={`mr-1 inline ${syncing ? "animate-spin" : ""}`} />{syncing ? "Syncing..." : "Sync now"}</button></div>{syncMessage && <p className={`mt-3 rounded-lg p-3 text-sm ${syncMessage.startsWith("Workspace synced") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-800"}`}>{syncMessage}</p>}</section>
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><FiCreditCard className="text-blue-600" /><h3 className="font-semibold text-gray-900">Plan and access</h3></div>{user.plan === "free" && !isAdmin ? <div className="mt-4 rounded-xl bg-blue-50 p-4"><p className="font-medium text-blue-950">Free plan limits</p><p className="mt-1 text-sm text-blue-800">2 languages and 10 questions per language.</p>{user.requestedPlan ? <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm font-medium text-amber-900"><FiClock />{user.requestedPlan} upgrade request pending</p> : <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => upgrade("monthly")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">Upgrade monthly</button><button onClick={() => upgrade("yearly")} className="rounded-lg border border-blue-600 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-white">Upgrade yearly</button></div>}</div> : <p className="mt-3 text-sm text-gray-600">{isAdmin ? "You manage user access and plan requests from this dashboard." : "Your premium access is active with unlimited workspace limits."}</p>}</section>
    {isAdmin && <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><FiShield className="text-indigo-600" /><div><h3 className="font-semibold text-gray-900">Admin dashboard</h3><p className="text-sm text-gray-500">Review registrations and plan upgrades centrally.</p></div></div><button onClick={loadRequests} disabled={loading} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"><FiRefreshCw className={`mr-1 inline ${loading ? "animate-spin" : ""}`} />Refresh</button></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><FiUsers className="text-slate-500" /><p className="mt-2 text-2xl font-bold">{summary.total}</p><p className="text-xs text-gray-500">User accounts</p></div><div className="rounded-xl bg-amber-50 p-3"><FiClock className="text-amber-600" /><p className="mt-2 text-2xl font-bold">{summary.pending}</p><p className="text-xs text-gray-500">Needs review</p></div><div className="rounded-xl bg-green-50 p-3"><FiCheck className="text-green-600" /><p className="mt-2 text-2xl font-bold">{summary.approved}</p><p className="text-xs text-gray-500">Approved users</p></div></div><div className="mt-5 space-y-3">{requests.length === 0 && !loading ? <p className="rounded-xl bg-gray-50 p-4 text-sm text-gray-500">No user requests yet.</p> : requests.map((request) => { const upgradePending = request.approvalStatus === "approved" && request.requestedPlan; const needsReview = request.approvalStatus === "pending" || upgradePending; const timeLeft = request.plan === "free" ? "Free plan" : remainingTime(request.subscriptionExpiresAt, now); return <article key={request.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-4"><button onClick={() => setSelectedUserId(request.id)} className="mr-auto min-w-52 text-left hover:opacity-70"><p className="font-medium">{request.name}</p><p className="text-sm text-gray-500">{request.email}</p><p className="mt-1 text-xs text-gray-400">{upgradePending ? `Upgrade requested: ${request.requestedPlan}` : `Plan: ${request.plan}`} · Created {formatDate(request.createdAt)}</p><p className={`mt-1 text-xs font-medium ${timeLeft === "Expired" ? "text-red-700" : "text-purple-700"}`}>Subscription remaining: {timeLeft}</p><span className="mt-1 inline-block text-xs font-medium text-blue-700">View full details →</span></button><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${needsReview ? "bg-amber-100 text-amber-800" : request.approvalStatus === "approved" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{needsReview ? "pending" : request.approvalStatus}</span><button onClick={() => review(request, "approved")} className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700">Approve</button><button onClick={() => review(request, "rejected")} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">Reject</button></article>; })}</div></section>}
    <div className="flex justify-end border-t pt-5"><button onClick={signOut} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">Sign out</button></div>
    {selectedUserId && <AdminUserDetails userId={selectedUserId} onClose={() => setSelectedUserId(null)} onChanged={loadRequests} />}
    {avatarPreviewOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Profile picture preview" onClick={() => setAvatarPreviewOpen(false)}><button type="button" onClick={() => setAvatarPreviewOpen(false)} className="absolute right-5 top-5 rounded-lg bg-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/25">Close</button><img src={user.avatarUrl} alt={`${user.name}'s profile`} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl" onClick={(event) => event.stopPropagation()} /></div>}
  </div>;
}
