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
  approvalStatus: profile.approval_status,
  createdAt: profile.created_at,
  reviewedAt: profile.reviewed_at
});

const getProfile = async (id) => {
  const client = requireSupabase();
  const { data, error } = await client.from("profiles").select("*").eq("id", id).single();
  if (error) throw error;
  return toProfile(data);
};

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
    if (profile.approvalStatus !== "approved") {
      await client.auth.signOut();
      throw new Error(profile.approvalStatus === "rejected"
        ? "Your access request was rejected. Please contact the administrator."
        : "Your access request is waiting for administrator approval.");
    }
    return profile;
  },

  async getCurrentUser() {
    const client = requireSupabase();
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    if (!session?.user) return null;
    const profile = await getProfile(session.user.id);
    return profile.approvalStatus === "approved" ? profile : null;
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
    const { data: { user }, error: userError } = await client.auth.getUser();
    if (userError) throw userError;
    const { error } = await client.from("profiles").update({
      approval_status: approvalStatus,
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id
    }).eq("id", id).eq("role", "user");
    if (error) throw error;
  }
};
