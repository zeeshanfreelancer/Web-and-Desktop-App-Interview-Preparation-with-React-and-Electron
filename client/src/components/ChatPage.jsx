import { FiArrowLeft, FiMessageCircle } from "react-icons/fi";
import MessagesPanel from "./MessagesPanel";

export default function ChatPage({ user, onBack }) {
  return <div className="min-h-screen bg-slate-100"><header className="border-b bg-white shadow-sm"><div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-4"><button type="button" onClick={onBack} className="rounded-lg p-2 text-gray-600 hover:bg-gray-100" title="Back to workspace"><FiArrowLeft size={21} /></button><div><h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><FiMessageCircle className="text-indigo-600" />Chat</h1><p className="text-sm text-gray-500">Community and administrator messages</p></div></div></header><main className="mx-auto h-[calc(100vh-89px)] max-w-5xl p-4"><section className="h-full rounded-2xl bg-white p-5 shadow-sm"><MessagesPanel user={user} /></section></main></div>;
}
