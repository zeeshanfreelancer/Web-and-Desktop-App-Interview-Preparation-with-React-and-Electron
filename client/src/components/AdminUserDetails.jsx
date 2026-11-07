// Admin modal for inspecting a user's profile and managing their synced workspace.
import { useCallback, useEffect, useState } from "react";
import { FiCircle, FiShield, FiTrash2, FiX } from "react-icons/fi";
import { profileService } from "../services/profiles";

const ONLINE_WINDOW_MS = 75_000;
const displayDate = (value) => value ? new Date(value).toLocaleString() : "Never";
const isOnline = (lastSeenAt) => lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS;

export default function AdminUserDetails({ userId, onClose, onChanged }) {
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setDetails(await profileService.getUserDetails(userId)); } catch (err) { setError(err.message || "Could not load user details."); } finally { setLoading(false); }
  }, [userId]);
  useEffect(() => { load(); }, [load]);

  const saveWorkspace = async (workspace) => {
    try { await profileService.saveUserWorkspace(userId, workspace); setDetails((current) => ({ ...current, workspace })); } catch (err) { setError(err.message || "Could not save workspace changes."); }
  };
  const deleteLanguage = async (language) => {
    if (!window.confirm(`Delete ${language} and all of its questions?`)) return;
    const workspace = { languages: details.workspace.languages.filter((item) => item !== language), questions: { ...details.workspace.questions } };
    delete workspace.questions[language];
    await saveWorkspace(workspace);
  };
  const deleteQuestion = async (language, id) => {
    if (!window.confirm("Delete this question?")) return;
    const workspace = { languages: details.workspace.languages, questions: { ...details.workspace.questions, [language]: details.workspace.questions[language].filter((item) => (item._id || item.id) !== id) } };
    await saveWorkspace(workspace);
  };
  const setBlocked = async () => {
    try { await profileService.setUserBlocked(userId, !details.profile.isBlocked); setDetails((current) => ({ ...current, profile: { ...current.profile, isBlocked: !current.profile.isBlocked } })); onChanged(); } catch (err) { setError(err.message || "Could not change the block status."); }
  };
  const deleteUser = async () => {
    if (!window.confirm("Permanently delete this user account and all workspace data? This cannot be undone.")) return;
    try { await profileService.deleteUser(userId); onChanged(); onClose(); } catch (err) { setError(err.message || "Could not delete the account."); }
  };

  const languages = Array.isArray(details?.workspace?.languages) ? details.workspace.languages : [];
  const questionsByLanguage = details?.workspace?.questions && typeof details.workspace.questions === "object" ? details.workspace.questions : {};
  const online = isOnline(details?.profile?.lastSeenAt);

  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"><div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-start justify-between border-b p-5"><div><h2 className="text-xl font-bold">User details</h2><p className="text-sm text-gray-500">Manage account, languages, and questions.</p></div><button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100"><FiX size={22} /></button></div>{loading ? <p className="p-8 text-center text-gray-500">Loading user details...</p> : error ? <div className="p-6"><p className="rounded bg-red-50 p-3 text-red-700">{error}</p></div> : <div className="grid min-h-0 flex-1 lg:grid-cols-[340px_1fr]"><aside className="overflow-y-auto border-b bg-slate-50 p-5 lg:border-b-0 lg:border-r"><div className="space-y-4"><div><p className="text-2xl font-bold">{details.profile.name}</p><p className="break-all text-sm text-gray-600">{details.profile.email}</p></div><dl className="space-y-3 text-sm"><div><dt className="text-gray-500">Activity</dt><dd className={`inline-flex items-center gap-1 font-medium ${online ? "text-green-700" : "text-gray-500"}`}><FiCircle size={10} fill="currentColor" />{online ? "Online now" : "Offline"}</dd></div><div><dt className="text-gray-500">Plan</dt><dd className="font-medium capitalize">{details.profile.plan}</dd></div><div><dt className="text-gray-500">Registration</dt><dd className="font-medium">{displayDate(details.profile.createdAt)}</dd></div><div><dt className="text-gray-500">Last active</dt><dd className="font-medium">{displayDate(details.profile.lastSeenAt)}</dd></div><div><dt className="text-gray-500">Account status</dt><dd className={`font-medium ${details.profile.isBlocked ? "text-red-700" : "text-green-700"}`}>{details.profile.isBlocked ? "Blocked" : "Active"}</dd></div></dl><button onClick={setBlocked} className={`w-full rounded-lg px-4 py-2 text-sm font-medium text-white ${details.profile.isBlocked ? "bg-green-600" : "bg-amber-600"}`}><FiShield className="mr-1 inline" />{details.profile.isBlocked ? "Unblock user" : "Block user"}</button><button onClick={deleteUser} className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white"><FiTrash2 className="mr-1 inline" />Delete account</button></div></aside><main className="overflow-y-auto p-5"><h3 className="font-semibold">Workspace</h3><p className="mb-4 text-sm text-gray-500">{languages.length} languages · {Object.values(questionsByLanguage).reduce((sum, items) => sum + (Array.isArray(items) ? items.length : 0), 0)} questions</p><div className="space-y-4">{languages.length === 0 ? <p className="rounded bg-gray-50 p-4 text-sm text-gray-500">No workspace data yet.</p> : languages.map((language) => { const questions = Array.isArray(questionsByLanguage[language]) ? questionsByLanguage[language] : []; return <section key={language} className="rounded-xl border"><div className="flex items-center justify-between border-b bg-gray-50 p-3"><h4 className="font-semibold">{language}</h4><button onClick={() => deleteLanguage(language)} className="rounded px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"><FiTrash2 className="mr-1 inline" />Delete language</button></div><div className="divide-y">{questions.length === 0 ? <p className="p-3 text-sm text-gray-500">No questions.</p> : questions.map((question) => <article key={question._id || question.id} className="p-3"><div className="flex gap-3"><div className="min-w-0 flex-1"><p className="font-medium">{question.question}</p><p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{question.answer || "No answer"}</p></div><button onClick={() => deleteQuestion(language, question._id || question.id)} className="h-fit rounded p-2 text-red-600 hover:bg-red-50" title="Delete question"><FiTrash2 /></button></div></article>)}</div></section>; })}</div></main></div>}</div></div>;
}
