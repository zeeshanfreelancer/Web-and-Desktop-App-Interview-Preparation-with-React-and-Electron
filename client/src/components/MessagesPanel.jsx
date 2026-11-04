import { useEffect, useRef, useState } from "react";
import { FiEdit2, FiMessageCircle, FiPaperclip, FiRefreshCw, FiSend, FiTrash2, FiUser, FiUsers, FiX } from "react-icons/fi";
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
  const [editingMessage, setEditingMessage] = useState(null);
  const [editingBody, setEditingBody] = useState("");
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
  const canEdit = (message) => !isAdmin && message.is_mine && Date.now() - new Date(message.created_at).getTime() <= 10 * 60_000;
  const saveEdit = async () => {
    if (!editingMessage || !editingBody.trim()) return;
    setError("");
    try { await profileService.editChatMessage(tab, editingMessage.id, editingBody); setEditingMessage(null); setEditingBody(""); channelRef.current?.send({ type: "broadcast", event: "message-created", payload: {} }); await load(true); } catch (err) { setError(err.message || "Could not edit message."); }
  };
  const deleteMessage = async (id) => {
    if (!window.confirm("Delete this message for everyone?")) return;
    setError("");
    try { await profileService.deleteChatMessage(tab, id); channelRef.current?.send({ type: "broadcast", event: "message-created", payload: {} }); await load(true); } catch (err) { setError(err.message || "Could not delete message."); }
  };

  return <div className="flex h-full min-h-0 overflow-hidden rounded-xl border border-gray-200 bg-white">
    <aside className="flex w-56 shrink-0 flex-col border-r bg-slate-50 p-3 sm:w-64">
      <div className="mb-4 px-2 text-sm font-semibold text-gray-800">Conversations</div>
      <nav className="space-y-1"><button type="button" onClick={() => setTab("group")} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium ${tab === "group" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-700 hover:bg-white"}`}><FiUsers size={18} /><span>Group</span></button><button type="button" onClick={() => setTab("direct")} className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium ${tab === "direct" ? "bg-indigo-600 text-white shadow-sm" : "text-gray-700 hover:bg-white"}`}><FiMessageCircle size={18} /><span>Private admin chat</span></button></nav>
      <div className="mt-auto rounded-lg bg-green-50 p-3 text-xs font-medium text-green-800"><p><span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500" />{stats.active_users} active</p><p className="mt-1">{stats.total_users} total users</p></div>
    </aside>
    <section className="flex min-w-0 flex-1 flex-col p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-3"><div><h2 className="font-semibold text-gray-900">{tab === "group" ? "Group chat" : "Private admin chat"}</h2><p className="text-sm text-gray-500">{tab === "group" ? "Users are anonymous." : isAdmin ? "Select a user to start a private chat." : "Private conversation with the administrator."}</p></div><button type="button" onClick={() => load()} className="rounded-lg border p-2 text-gray-600 hover:bg-gray-50" title="Refresh"><FiRefreshCw className={loading ? "animate-spin" : ""} /></button></header>
      {tab === "direct" && isAdmin && <div className="mt-3 flex items-center gap-2"><FiUser className="text-gray-500" /><select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"><option value="">Choose a user</option>{users.map((member) => <option key={member.id} value={member.id}>{member.name} ({member.email})</option>)}</select></div>}
      {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-4">{messages.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">{tab === "direct" && isAdmin && !selectedUserId ? "Choose a user to start a conversation." : "No messages yet. Start the conversation."}</p> : messages.map((message) => { const url = profileService.getChatAttachmentUrl(message.attachment_path); const isEditing = editingMessage?.id === message.id; return <article key={message.id} className={`max-w-[85%] rounded-2xl p-3 text-sm ${message.is_mine ? "ml-auto bg-indigo-600 text-white" : "bg-white text-gray-800 shadow-sm"}`}><div className="flex items-start justify-between gap-3"><p className={`text-xs font-medium ${message.is_mine ? "text-indigo-100" : "text-gray-500"}`}>{message.sender_label} · {time(message.created_at)}</p><div className="flex gap-1">{canEdit(message) && <button type="button" onClick={() => { setEditingMessage(message); setEditingBody(message.body); }} className="rounded p-1 text-indigo-100 hover:bg-indigo-500" title="Edit message"><FiEdit2 size={14} /></button>}{isAdmin && <button type="button" onClick={() => deleteMessage(message.id)} className={`rounded p-1 hover:bg-red-100 ${message.is_mine ? "text-indigo-100" : "text-red-600"}`} title="Delete message"><FiTrash2 size={14} /></button>}</div></div>{isEditing ? <div className="mt-2"><textarea value={editingBody} onChange={(event) => setEditingBody(event.target.value)} maxLength={2000} className="w-full rounded-lg border p-2 text-sm text-gray-800" rows={3} /><div className="mt-2 flex gap-2"><button type="button" onClick={saveEdit} className="rounded bg-white px-3 py-1 text-xs font-medium text-indigo-700">Save</button><button type="button" onClick={() => { setEditingMessage(null); setEditingBody(""); }} className="rounded bg-indigo-500 px-3 py-1 text-xs">Cancel</button></div></div> : <>{message.body && <p className="mt-1 whitespace-pre-wrap">{message.body}</p>}{url && (isImage(message.attachment_type) ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={message.attachment_name || "Attached image"} className="mt-2 max-h-60 rounded-lg object-contain" /></a> : <a href={url} target="_blank" rel="noreferrer" className={`mt-2 block rounded-lg p-2 text-xs underline ${message.is_mine ? "bg-indigo-500" : "bg-gray-100"}`}>Attachment: {message.attachment_name || "Download"}</a>)}</>}</article>; })}</div>
      {attachment && <div className="mt-3 flex items-center justify-between rounded-lg bg-indigo-50 p-2 text-sm text-indigo-900"><span className="truncate">Attached: {attachment.name}</span><button type="button" onClick={() => setAttachment(null)}><FiX /></button></div>}
      <form onSubmit={send} className="mt-3 flex gap-2"><input ref={fileRef} type="file" onChange={(event) => setAttachment(event.target.files?.[0] || null)} className="hidden" /><button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg border px-3 text-gray-600 hover:bg-gray-50" title="Attach image or document"><FiPaperclip /></button><input value={text} onChange={(event) => setText(event.target.value)} maxLength={2000} disabled={tab === "direct" && isAdmin && !selectedUserId} placeholder="Write a message..." className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:bg-gray-100" /><button type="submit" disabled={loading || (tab === "direct" && isAdmin && !selectedUserId)} className="rounded-lg bg-indigo-600 px-4 text-white hover:bg-indigo-700 disabled:opacity-50"><FiSend /></button></form>
    </section>
  </div>;
}
