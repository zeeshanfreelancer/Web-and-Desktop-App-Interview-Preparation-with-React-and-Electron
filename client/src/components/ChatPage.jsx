// Full-page wrapper for chat, with a back action to return to the interview workspace.
import { FiArrowLeft } from "react-icons/fi";
import MessagesPanel from "./MessagesPanel";

export default function ChatPage({ user, onBack }) {
  return <div className="h-screen w-screen bg-white"><main className="relative h-full w-full"><button type="button" onClick={onBack} className="absolute left-4 top-4 z-10 rounded-lg bg-white/90 p-2 text-gray-600 shadow hover:bg-white" title="Back to workspace"><FiArrowLeft size={21} /></button><section className="h-full w-full"><MessagesPanel user={user} /></section></main></div>;
}
