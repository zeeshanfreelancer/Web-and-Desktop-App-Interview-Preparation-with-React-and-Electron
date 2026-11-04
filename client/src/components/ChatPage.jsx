import { FiArrowLeft } from "react-icons/fi";
import MessagesPanel from "./MessagesPanel";

export default function ChatPage({ user, onBack }) {
  return <div className="min-h-screen bg-slate-100 p-4"><main className="relative mx-auto h-[calc(100vh-2rem)] max-w-6xl"><button type="button" onClick={onBack} className="absolute left-4 top-4 z-10 rounded-lg bg-white/90 p-2 text-gray-600 shadow hover:bg-white" title="Back to workspace"><FiArrowLeft size={21} /></button><section className="h-full rounded-2xl bg-white p-5 shadow-sm"><MessagesPanel user={user} /></section></main></div>;
}
