import { useEffect, useState } from "react";
import { FiMessageCircle, FiRefreshCw, FiSend, FiUsers } from "react-icons/fi";
import { profileService } from "../services/profiles";

const time = (value) => new Date(value).toLocaleString();

export default function MessagesPanel({ user, users = [] }) {
  const isAdmin = user.role === "admin";
  const [tab, setTab] = useState("group");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [groupMessages, setGroupMessages] = useState([]);
  const [directMessages, setDirectMessages] = useState([]);
  const [groupText, setGroupText] = useState("");
  const [directText, setDirectText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadGroup = async () => {
    setLoading(true); setError("");
    try { setGroupMessages(await profileService.getGroupMessages()); } catch (err) { setError(err.message || "Could not load group messages."); } finally { setLoading(false); }
  };
  const loadDirect = async () => {
    if (isAdmin && !selectedUserId) { setDirectMessages([]); return; }
    setLoading(true); setError("");
    try { setDirectMessages(await profileService.getDirectMessages(isAdmin ? selectedUserId : null)); } catch (err) { setError(err.message || "Could not load messages."); } finally { setLoading(false); }
  };
  useEffect(() => { if (tab === "group") loadGroup(); else loadDirect(); }, [tab, selectedUserId]);

  const sendGroup = async (event) => {
    event.preventDefault(); if (!groupText.trim()) return;
    try { await profileService.sendGroupMessage(groupText); setGroupText(""); await loadGroup(); } catch (err) { setError(err.message || "Could not send message."); }
  };
  const sendDirect = async (event) => {
    event.preventDefault(); if (!directText.trim() || (isAdmin && !selectedUserId)) return;
    try { await profileService.sendDirectMessage(isAdmin ? selectedUserId : null, directText); setDirectText(""); await loadDirect(); } catch (err) { setError(err.message || "Could not send message."); }
  };
  const messages = tab === "group" ? groupMessages : directMessages;

  return <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold text-gray-900"><FiMessageCircle className="text-indigo-600" />Messages</h3><p className="mt-1 text-sm text-gray-500">{tab === "group" ? "Group messages are anonymous for all members." : isAdmin ? "Private conversation with the selected user." : "Private conversation with the administrator."}</p></div><button type="button" onClick={tab === "group" ? loadGroup : loadDirect} disabled={loading} className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"><FiRefreshCw className={`mr-1 inline ${loading ? "animate-spin" : ""}`} />Refresh</button></div>
    <div className="mt-4 flex gap-2 border-b"><button type="button" onClick={() => setTab("group")} className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "group" ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500"}`}><FiUsers className="mr-1 inline" />Anonymous group</button><button type="button" onClick={() => setTab("direct")} className={`border-b-2 px-3 py-2 text-sm font-medium ${tab === "direct" ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500"}`}>Admin messages</button></div>
    {tab === "direct" && isAdmin && <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="mt-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Choose a user</option>{users.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.email})</option>)}</select>}
    {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-3">{messages.length === 0 ? <p className="py-6 text-center text-sm text-gray-500">{tab === "direct" && isAdmin && !selectedUserId ? "Choose a user to start a private conversation." : "No messages yet."}</p> : messages.map((message) => <article key={message.id} className={`max-w-[85%] rounded-xl p-3 text-sm ${message.is_mine ? "ml-auto bg-indigo-600 text-white" : "bg-white text-gray-800 shadow-sm"}`}><p className={`text-xs font-medium ${message.is_mine ? "text-indigo-100" : "text-gray-500"}`}>{message.sender_label} · {time(message.created_at)}</p><p className="mt-1 whitespace-pre-wrap">{message.body}</p></article>)}</div>
    <form onSubmit={tab === "group" ? sendGroup : sendDirect} className="mt-3 flex gap-2"><input value={tab === "group" ? groupText : directText} onChange={(event) => tab === "group" ? setGroupText(event.target.value) : setDirectText(event.target.value)} maxLength={2000} disabled={tab === "direct" && isAdmin && !selectedUserId} placeholder={tab === "group" ? "Write an anonymous group message..." : "Write a private message..."} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none" /><button type="submit" disabled={tab === "direct" && isAdmin && !selectedUserId} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"><FiSend /></button></form>
  </section>;
}
