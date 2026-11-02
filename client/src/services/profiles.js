import { supabase, supabaseConfigurationError } from "./supabase";

const requireSupabase = () => {
  if (!supabase) throw new Error(supabaseConfigurationError);
  return supabase;
};

const toProfile = (profile) => profile && ({
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
  createdAt: profile.created_at,
  reviewedAt: profile.reviewed_at
});

const getProfile = async (id) => {
  const client = requireSupabase();
  const { data, error } = await client.from("profiles").select("*").eq("id", id).single();
  if (error) throw error;
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
