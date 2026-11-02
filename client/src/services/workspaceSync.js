import { supabase } from "./supabase";
import { localStorageService } from "./localStorage";

let activeUserId = null;
let timer = null;
let syncing = false;

const questionId = (question) => question._id || question.id;
const updatedAt = (question) => new Date(question.updatedAt || question.createdAt || 0).getTime();

function mergeQuestions(localQuestions = {}, cloudQuestions = {}) {
  const languages = new Set([...Object.keys(cloudQuestions), ...Object.keys(localQuestions)]);
  const merged = {};
  for (const language of languages) {
    const byId = new Map();
    for (const question of [...(cloudQuestions[language] || []), ...(localQuestions[language] || [])]) {
      const id = questionId(question);
      const existing = byId.get(id);
      if (!existing || updatedAt(question) >= updatedAt(existing)) byId.set(id, question);
    }
    merged[language] = [...byId.values()];
  }
  return merged;
}

function mergeWorkspace(local, cloud) {
  const questions = mergeQuestions(local.questions, cloud.questions);
  const languages = [...new Set([...(cloud.languages || []), ...(local.languages || []), ...Object.keys(questions)])];
  return { languages, questions };
}

async function saveWorkspace() {
  if (!supabase || !activeUserId || !navigator.onLine || syncing) return false;
  syncing = true;
  try {
    const workspace = localStorageService.getWorkspaceSnapshot();
    const { error } = await supabase.from("user_workspaces").upsert({
      user_id: activeUserId,
      languages: workspace.languages,
      questions: workspace.questions,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn("Workspace sync deferred:", error.message);
    return false;
  } finally { syncing = false; }
}

function scheduleSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(saveWorkspace, 700);
}

export const workspaceSync = {
  async start(userId) {
    activeUserId = userId;
    localStorageService.setSyncHandler(scheduleSave);
    if (!supabase || !navigator.onLine) return;
    try {
      const { data, error } = await supabase.from("user_workspaces").select("languages, questions").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      const local = localStorageService.getWorkspaceSnapshot();
      const workspace = data ? mergeWorkspace(local, data) : local;
      localStorageService.replaceWorkspaceSnapshot(workspace);
      await saveWorkspace();
    } catch (error) {
      console.warn("Workspace restore deferred:", error.message);
    }
  },

  async syncNow() {
    if (timer) clearTimeout(timer);
    return saveWorkspace();
  },

  stop() {
    if (timer) clearTimeout(timer);
    localStorageService.setSyncHandler(null);
    activeUserId = null;
  }
};
