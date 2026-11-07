// Admin-only list showing each user's subscription or trial time remaining.
import { useEffect, useState } from "react";
import { FiClock } from "react-icons/fi";
import { profileService } from "../services/profiles";

const remaining = (expiresAt, now) => {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt);
  if (Number.isNaN(expiry.getTime()) || expiry <= now) return "Expired";
  const cursor = new Date(now);
  let years = 0;
  let months = 0;
  while (new Date(cursor.getFullYear() + 1, cursor.getMonth(), cursor.getDate(), cursor.getHours(), cursor.getMinutes()) <= expiry) { cursor.setFullYear(cursor.getFullYear() + 1); years += 1; }
  while (new Date(cursor.getFullYear(), cursor.getMonth() + 1, cursor.getDate(), cursor.getHours(), cursor.getMinutes()) <= expiry) { cursor.setMonth(cursor.getMonth() + 1); months += 1; }
  let milliseconds = expiry - cursor;
  const days = Math.floor(milliseconds / 86_400_000); milliseconds -= days * 86_400_000;
  const hours = Math.floor(milliseconds / 3_600_000); milliseconds -= hours * 3_600_000;
  const minutes = Math.floor(milliseconds / 60_000);
  return `${years}y ${months}m ${days}d ${hours}h ${minutes}min`;
};

export default function AdminSubscriptionList() {
  const [users, setUsers] = useState([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    profileService.getRequests().then(setUsers).catch(() => setUsers([]));
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return <section className="mt-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-2"><FiClock className="text-purple-600" /><div><h3 className="font-semibold text-gray-900">User subscription time</h3><p className="text-sm text-gray-500">Time remaining for every user account.</p></div></div>
    <div className="mt-4 divide-y rounded-xl border">
      {users.length === 0 ? <p className="p-4 text-sm text-gray-500">No user accounts yet.</p> : users.map((member) => {
        const time = remaining(member.subscriptionExpiresAt, now);
        return <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-medium">{member.name}</p><p className="text-sm text-gray-500">{member.email} · <span className="capitalize">{member.plan}</span></p></div><div className={`rounded-lg px-3 py-2 text-right text-sm font-semibold ${time === "Expired" ? "bg-red-50 text-red-700" : time ? "bg-purple-50 text-purple-800" : "bg-slate-50 text-slate-600"}`}><p>{time || (member.plan === "free" ? "Free plan" : "Not set")}</p>{member.subscriptionExpiresAt && <p className="mt-1 text-xs font-normal">Expires {new Date(member.subscriptionExpiresAt).toLocaleString()}</p>}</div></div>;
      })}
    </div>
  </section>;
}
