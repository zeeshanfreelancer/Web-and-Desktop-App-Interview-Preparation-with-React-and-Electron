import { supabase, supabaseConfigurationError } from "./supabase";

const requireSupabase = () => {
  if (!supabase) throw new Error(supabaseConfigurationError);
  return supabase;
};

const toProfile = (profile) => {
  const isAdmin = profile.role === "admin";
  const trialActive = !isAdmin && profile.plan === "free" && profile.free_trial_expires_at && new Date(profile.free_trial_expires_at).getTime() > Date.now();
  return ({
  id: profile.id,
  name: profile.full_name,
  email: profile.email,
  role: profile.role,
  plan: profile.plan,
  requestedPlan: profile.requested_plan,
  approvalStatus: profile.approval_status,
  isBlocked: profile.is_blocked,
  lastSeenAt: profile.last_seen_at,
  subscriptionStartedAt: profile.subscription_started_at,
  subscriptionExpiresAt: profile.subscription_expires_at,
  freeTrialStartedAt: profile.free_trial_started_at,
  freeTrialExpiresAt: profile.free_trial_expires_at,
  effectivePlan: isAdmin ? "lifetime" : trialActive ? "trial" : profile.plan,
  avatarUrl: profile.avatar_path ? `${requireSupabase().storage.from("profile-avatars").getPublicUrl(profile.avatar_path).data.publicUrl}?v=${encodeURIComponent(profile.updated_at || profile.avatar_path)}` : null,
  createdAt: profile.created_at,
  reviewedAt: profile.reviewed_at
  });
};

const fetchProfile = async (client, id) => {
  // Do not request PostgREST's single-object response here. Some existing
  // deployments were created without the profiles primary-key constraint,
  // which makes `.maybeSingle()` fail during login before a profile can be
  // repaired. The account id is still the authoritative lookup key.
  const { data, error } = await client.from("profiles").select("*").eq("id", id).limit(1);
  if (error) throw error;
  return data?.[0] ?? null;
};

const getProfile = async (id) => {
  const client = requireSupabase();
  let data = await fetchProfile(client, id);
  if (!data) {
    const { error: repairError } = await client.rpc("ensure_my_profile");
    if (repairError) throw repairError;
    data = await fetchProfile(client, id);
  }
  if (!data) throw new Error("Your profile could not be created. Please contact the administrator.");
  return toProfile(data);
};

const subscriptionExpired = (profile) =>
  ["monthly", "yearly"].includes(profile.plan)
  && Boolean(profile.subscriptionExpiresAt)
  && new Date(profile.subscriptionExpiresAt).getTime() <= Date.now();

export const profileService = {
  isConfigured: () => Boolean(supabase),
  configurationError: supabaseConfigurationError,

  async register({ name, email, password, plan }) {
    const client = requireSupabase();
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim(), plan } }
    });
    if (error) throw error;
    if (!data.user) throw new Error("Could not create your request.");
    return data;
  },

  async authenticate(email, password) {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    const profile = await getProfile(data.user.id);
    if (profile.approvalStatus !== "approved" || profile.isBlocked || subscriptionExpired(profile)) {
      await client.auth.signOut();
      throw new Error(profile.isBlocked
        ? "Your account has been blocked. Please contact the administrator."
        : subscriptionExpired(profile)
        ? "Your subscription has expired. Please contact the administrator to renew it."
        : profile.approvalStatus === "rejected"
        ? "Your access request was rejected. Please contact the administrator."
        : "Your access request is waiting for administrator approval.");
    }
    localStorage.setItem("interview-last-account-email", profile.email);
    await this.touchLastSeen();
    return profile;
  },

  async getCurrentUser() {
    const client = requireSupabase();
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    if (!session?.user) return null;
    const profile = await getProfile(session.user.id);
    if (profile.approvalStatus !== "approved" || profile.isBlocked || subscriptionExpired(profile)) return null;
    await this.touchLastSeen();
    return profile;
  },

  async signOut() {
    const { error } = await requireSupabase().auth.signOut();
    if (error) throw error;
  },

  async getRequests() {
    const { data, error } = await requireSupabase().from("profiles").select("*").eq("role", "user").order("created_at", { ascending: false });
    if (error) throw error;
    return data.map(toProfile);
  },

  async reviewRequest(id, approvalStatus) {
    const client = requireSupabase();
    const { error } = await client.rpc("admin_review_user", { target_user_id: id, decision: approvalStatus });
    if (error) throw error;
  },

  async requestUpgrade(plan) {
    if (!['monthly', 'yearly'].includes(plan)) throw new Error("Choose a monthly or yearly plan.");
    const client = requireSupabase();
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    const { data, error } = await client.from("profiles").update({ requested_plan: plan }).eq("id", user.id).select("*").single();
    if (error) throw error;
    return toProfile(data);
  },

  async touchLastSeen() {
    const { error } = await requireSupabase().rpc("touch_last_seen");
    if (error) throw error;
  },

  async uploadAvatar(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
    if (file.size > 2 * 1024 * 1024) throw new Error("Profile images must be 2 MB or smaller.");
    const client = requireSupabase();
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error("You must be signed in.");
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${user.id}/avatar.${extension}`;
    const { error: uploadError } = await client.storage.from("profile-avatars").upload(path, file, { upsert: true, contentType: file.type });
    if (uploadError) throw uploadError;
    const { error } = await client.rpc("update_my_avatar", { next_avatar_path: path });
    if (error) throw error;
    return getProfile(user.id);
  },

  async removeAvatar() {
    const client = requireSupabase();
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error("You must be signed in.");
    const { error } = await client.rpc("remove_my_avatar");
    if (error) throw error;
    return getProfile(user.id);
  },

  async getDirectMessages(userId = null) {
    const { data, error } = await requireSupabase().rpc("get_direct_messages", { target_user_id: userId });
    if (error) throw error;
    return data;
  },

  async sendDirectMessage(userId, body, attachment = null) {
    const { error } = await requireSupabase().rpc("send_direct_message", { target_user_id: userId, message_text: body, next_attachment_path: attachment?.path ?? null, next_attachment_name: attachment?.name ?? null, next_attachment_type: attachment?.type ?? null });
    if (error) throw error;
  },

  async getGroupMessages() {
    const { data, error } = await requireSupabase().rpc("get_group_messages");
    if (error) throw error;
    return data;
  },

  async sendGroupMessage(body, attachment = null) {
    const { error } = await requireSupabase().rpc("send_group_message", { message_text: body, next_attachment_path: attachment?.path ?? null, next_attachment_name: attachment?.name ?? null, next_attachment_type: attachment?.type ?? null });
    if (error) throw error;
  },

  async getChatStats() {
    const { data, error } = await requireSupabase().rpc("get_chat_stats");
    if (error) throw error;
    return data?.[0] || { total_users: 0, active_users: 0 };
  },

  async uploadChatAttachment(file) {
    if (!file) return null;
    if (file.size > 10 * 1024 * 1024) throw new Error("Attachments must be 10 MB or smaller.");
    const client = requireSupabase();
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error("You must be signed in.");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${user.id}/${Date.now()}-${safeName}`;
    const { error } = await client.storage.from("chat-attachments").upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (error) throw error;
    return { path, name: file.name, type: file.type };
  },

  getChatAttachmentUrl(path) {
    return path ? requireSupabase().storage.from("chat-attachments").getPublicUrl(path).data.publicUrl : null;
  },

  async editChatMessage(scope, id, body) {
    const { error } = await requireSupabase().rpc("edit_chat_message", { message_scope: scope, target_message_id: id, next_body: body });
    if (error) throw error;
  },

  async deleteChatMessage(scope, id) {
    const { error } = await requireSupabase().rpc("admin_delete_chat_message", { message_scope: scope, target_message_id: id });
    if (error) throw error;
  },

  async getUserDetails(id) {
    const { data, error } = await requireSupabase().rpc("admin_get_user_details", { target_user_id: id });
    if (error) throw error;
    return {
      profile: toProfile(data.profile),
      workspace: {
        languages: Array.isArray(data.workspace?.languages) ? data.workspace.languages : [],
        questions: data.workspace?.questions && typeof data.workspace.questions === "object" ? data.workspace.questions : {}
      }
    };
  },

  async saveUserWorkspace(id, workspace) {
    const { error } = await requireSupabase().rpc("admin_save_user_workspace", {
      target_user_id: id,
      next_languages: workspace.languages,
      next_questions: workspace.questions
    });
    if (error) throw error;
  },

  async setUserBlocked(id, blocked) {
    const { error } = await requireSupabase().rpc("admin_set_user_blocked", { target_user_id: id, blocked });
    if (error) throw error;
  },

  async deleteUser(id) {
    const { error } = await requireSupabase().rpc("admin_delete_user", { target_user_id: id });
    if (error) throw error;
  }
};
