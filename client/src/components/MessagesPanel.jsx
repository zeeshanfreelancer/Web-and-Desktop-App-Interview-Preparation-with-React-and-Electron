import { useEffect, useRef, useState } from "react";
import { FiPaperclip, FiRefreshCw, FiSend, FiUsers, FiX } from "react-icons/fi";
import { profileService } from "../services/profiles";
import { supabase } from "../services/supabase";

const time = (value) => new Date(value).toLocaleString();
const isImage = (type) => type?.startsWith("image/");

export default function MessagesPanel({ user }) {
  const isAdmin = user.role === "admin";
  const [tab, setTab] = useState("group");
  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState(null);
  const [stats, setStats] = useState({ total_users: 0, active_users: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);
  const channelRef = useRef(null);

  const load = async (quiet = false) => {
    if (tab === "direct" && isAdmin && !selectedUserId) { setMessages([]); return; }
    if (!quiet) setLoading(true);
    try { setMessages(tab === "group" ? await profileService.getGroupMessages() : await profileService.getDirectMessages(isAdmin ? selectedUserId : null)); } catch (err) { if (!quiet) setError(err.message || "Could not load messages."); } finally { if (!quiet) setLoading(false); }
  };
  const loadStats = () => profileService.getChatStats().then(setStats).catch(() => {});
  useEffect(() => { load(); loadStats(); }, [tab, selectedUserId]);
  useEffect(() => {
    if (!supabase) return undefined;
    const channel = supabase.channel("interview-prep-chat", { config: { broadcast: { self: false } } });
    channelRef.current = channel;
    channel.on("broadcast", { event: "message-created" }, () => { load(true); loadStats(); }).subscribe();
    return () => { if (channelRef.current === channel) channelRef.current = null; supabase.removeChannel(channel); };
  }, [tab, selectedUserId]);
  useEffect(() => { const interval = window.setInterval(() => { load(true); loadStats(); }, 30_000); return () => window.clearInterval(interval); }, [tab, selectedUserId]);
  useEffect(() => { if (isAdmin) profileService.getRequests().then(setUsers).catch((err) => setError(err.message || "Could not load users.")); }, [isAdmin]);

  const send = async (event) => {
    event.preventDefault();
    if ((!text.trim() && !attachment) || (tab === "direct" && isAdmin && !selectedUserId)) return;
    setError(""); setLoading(true);
    try {
      const uploaded = attachment ? await profileService.uploadChatAttachment(attachment) : null;
      if (tab === "group") await profileService.sendGroupMessage(text, uploaded);
      else await profileService.sendDirectMessage(isAdmin ? selectedUserId : null, text, uploaded);
      channelRef.current?.send({ type: "broadcast", event: "message-created", payload: {} });
      setText(""); setAttachment(null); await load(true);
    } catch (err) { setError(err.message || "Could not send message."); } finally { setLoading(false); }
  };

  return <div className="flex h-full min-h-0 flex-col">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"><div className="flex gap-2"><button type="button" onClick={() => setTab("group")} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === "group" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}><FiUsers className="mr-1 inline" />Group</button><button type="button" onClick={() => setTab("direct")} className={`rounded-lg px-3 py-2 text-sm font-medium ${tab === "direct" ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>Private admin chat</button></div><div className="rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-800"><span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />{stats.active_users} active · {stats.total_users} users</div></div>
    {tab === "group" ? <p className="mt-3 text-sm text-gray-500">Users are anonymous in this group. Administrators can see the sender name.</p> : isAdmin ? <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="mt-3 rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Choose a user</option>{users.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.email})</option>)}</select> : <p className="mt-3 text-sm text-gray-500">Private conversation with the administrator.</p>}
    {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-4">{messages.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">{tab === "direct" && isAdmin && !selectedUserId ? "Choose a user to start a conversation." : "No messages yet. Start the conversation."}</p> : messages.map((message) => { const url = profileService.getChatAttachmentUrl(message.attachment_path); return <article key={message.id} className={`max-w-[85%] rounded-2xl p-3 text-sm ${message.is_mine ? "ml-auto bg-indigo-600 text-white" : "bg-white text-gray-800 shadow-sm"}`}><p className={`text-xs font-medium ${message.is_mine ? "text-indigo-100" : "text-gray-500"}`}>{message.sender_label} · {time(message.created_at)}</p>{message.body && <p className="mt-1 whitespace-pre-wrap">{message.body}</p>}{url && (isImage(message.attachment_type) ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={message.attachment_name || "Attached image"} className="mt-2 max-h-60 rounded-lg object-contain" /></a> : <a href={url} target="_blank" rel="noreferrer" className={`mt-2 block rounded-lg p-2 text-xs underline ${message.is_mine ? "bg-indigo-500" : "bg-gray-100"}`}>📎 {message.attachment_name || "Download attachment"}</a>)}</article>; })}</div>
    {attachment && <div className="mt-3 flex items-center justify-between rounded-lg bg-indigo-50 p-2 text-sm text-indigo-900"><span className="truncate">Attached: {attachment.name}</span><button type="button" onClick={() => setAttachment(null)}><FiX /></button></div>}
    <form onSubmit={send} className="mt-3 flex gap-2"><input ref={fileRef} type="file" onChange={(event) => setAttachment(event.target.files?.[0] || null)} className="hidden" /><button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border px-3 text-gray-600 hover:bg-gray-50" title="Attach image or document"><FiPaperclip /></button><input value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} disabled={tab === "direct" && isAdmin && !selectedUserId} placeholder="Write a message..." className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-gray-100" /><button type="submit" disabled={loading || (tab === "direct" && isAdmin && !selectedUserId)} className="rounded-lg bg-indigo-600 px-4 text-white hover:bg-indigo-700 disabled:opacity-50"><FiSend /></button><button type="button" onClick={() => load()} className="rounded-lg border px-3 text-gray-600 hover:bg-gray-50" title="Refresh"><FiRefreshCw className={loading ? "animate-spin" : ""} /></button></form>
  </div>;
}
