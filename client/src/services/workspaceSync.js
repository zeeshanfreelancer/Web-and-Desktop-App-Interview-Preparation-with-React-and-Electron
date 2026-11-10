// Manually synchronizes the local interview workspace with Supabase and exposes progress for the UI.
import { supabase } from "./supabase";
import { localStorageService } from "./localStorage";

let activeUserId = null;
let syncing = false;
const listeners = new Set();
let status = { state: "idle", progress: 0, lastSyncAt: null, totalBytes: 0, message: "Not synced on this device yet." };

const metadataKey = (userId) => `interview-workspace-sync:${userId}`;
const questionId = (question) => question._id || question.id;
const updatedAt = (question) => new Date(question.updatedAt || question.createdAt || 0).getTime();
const byteSize = (value) => new Blob([JSON.stringify(value)]).size;
const questionCount = (workspace) => Object.values(workspace.questions || {}).reduce((total, questions) => total + (Array.isArray(questions) ? questions.length : 0), 0);

function emit(next) {
  status = { ...status, ...next };
  listeners.forEach((listener) => listener(status));
}

function saveMetadata() {
  if (!activeUserId) return;
  localStorage.setItem(metadataKey(activeUserId), JSON.stringify({ lastSyncAt: status.lastSyncAt, totalBytes: status.totalBytes }));
}

function loadMetadata(userId) {
  try { return JSON.parse(localStorage.getItem(metadataKey(userId)) || "null") || {}; } catch { return {}; }
}

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

async function fetchCloudWorkspace() {
  if (!supabase || !activeUserId) return null;
  const { data, error } = await supabase.from("user_workspaces").select("languages, questions, updated_at").eq("user_id", activeUserId).maybeSingle();
  if (error) throw error;
  return data;
}

function ensureReady() {
  if (!supabase) throw new Error("Supabase is not configured.");
  if (!activeUserId) throw new Error("No signed-in user is available for syncing.");
  if (!navigator.onLine) throw new Error("You are offline. Connect to the internet and try again.");
  if (syncing) throw new Error("A sync is already in progress.");
}

export const workspaceSync = {
  getStatus: () => status,
  subscribe(listener) {
    listeners.add(listener);
    listener(status);
    return () => listeners.delete(listener);
  },

  async start(userId) {
    activeUserId = userId;
    // Changes are intentionally stored locally until the user chooses Sync now.
    localStorageService.setSyncHandler(null);
    const saved = loadMetadata(userId);
    emit({ state: "idle", progress: 0, lastSyncAt: saved.lastSyncAt || null, totalBytes: saved.totalBytes || 0, message: saved.lastSyncAt ? "Ready to sync." : "Not synced on this device yet." });

    if (!supabase || !navigator.onLine) return { needsRestore: false };
    try {
      const cloud = await fetchCloudWorkspace();
      const local = localStorageService.getWorkspaceSnapshot();
      const cloudHasData = cloud && (cloud.languages?.length || questionCount(cloud));
      const localHasData = local.languages.length || questionCount(local);
      return { needsRestore: Boolean(cloudHasData && !localHasData), cloudUpdatedAt: cloud?.updated_at || null, cloudBytes: cloud ? byteSize({ languages: cloud.languages, questions: cloud.questions }) : 0 };
    } catch (error) {
      console.warn("Workspace availability check failed:", error.message);
      return { needsRestore: false };
    }
  },

  async syncNow() {
    ensureReady();
    syncing = true;
    try {
      emit({ state: "syncing", progress: 10, message: "Preparing your workspace…" });
      const local = localStorageService.getWorkspaceSnapshot();
      emit({ progress: 35, message: "Checking cloud changes…" });
      const cloud = await fetchCloudWorkspace();
      const workspace = mergeWorkspace(local, cloud || { languages: [], questions: {} });
      localStorageService.replaceWorkspaceSnapshot(workspace);
      const totalBytes = byteSize(workspace);
      emit({ progress: 70, totalBytes, message: "Uploading workspace…" });
      const { error } = await supabase.from("user_workspaces").upsert({ user_id: activeUserId, languages: workspace.languages, questions: workspace.questions, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) throw error;
      const lastSyncAt = new Date().toISOString();
      emit({ state: "complete", progress: 100, lastSyncAt, totalBytes, message: "Workspace synced successfully." });
      saveMetadata();
      return status;
    } catch (error) {
      emit({ state: "error", progress: 0, message: error.message || "Workspace sync failed." });
      throw error;
    } finally {
      syncing = false;
    }
  },

  async restoreFromCloud() {
    ensureReady();
    syncing = true;
    try {
      emit({ state: "syncing", progress: 20, message: "Downloading your saved workspace…" });
      const cloud = await fetchCloudWorkspace();
      if (!cloud) throw new Error("No saved workspace was found for this account.");
      const workspace = mergeWorkspace(localStorageService.getWorkspaceSnapshot(), cloud);
      localStorageService.replaceWorkspaceSnapshot(workspace);
      const totalBytes = byteSize(workspace);
      const lastSyncAt = new Date().toISOString();
      emit({ state: "complete", progress: 100, lastSyncAt, totalBytes, message: "Saved workspace loaded on this device." });
      saveMetadata();
      return status;
    } catch (error) {
      emit({ state: "error", progress: 0, message: error.message || "Could not load the saved workspace." });
      throw error;
    } finally {
      syncing = false;
    }
  },

  stop() {
    localStorageService.setSyncHandler(null);
    activeUserId = null;
    syncing = false;
    emit({ state: "idle", progress: 0, lastSyncAt: null, totalBytes: 0, message: "Not signed in." });
  }
};
