const PROFILES_KEY = "interview-profiles";

const newId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

async function hashPassword(password, salt) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const readProfiles = () => JSON.parse(localStorage.getItem(PROFILES_KEY) || "[]");
const writeProfiles = (profiles) => localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));

export const profileService = {
  getProfiles: readProfiles,

  async createAdmin({ name, username, password }) {
    if (readProfiles().length) throw new Error("An admin profile already exists.");
    return this.createProfile({ name, username, password, role: "admin" });
  },

  async createProfile({ name, username, password, role = "client" }) {
    const profiles = readProfiles();
    const normalizedUsername = username.trim().toLowerCase();
    if (!name.trim() || !normalizedUsername || !password) throw new Error("Name, username, and password are required.");
    if (profiles.some((profile) => profile.username === normalizedUsername)) throw new Error("That username is already in use.");

    const salt = newId();
    const profile = {
      id: newId(), name: name.trim(), username: normalizedUsername, role,
      salt, passwordHash: await hashPassword(password, salt), createdAt: new Date().toISOString()
    };
    profiles.push(profile);
    writeProfiles(profiles);
    return this.publicProfile(profile);
  },

  async authenticate(username, password) {
    const profile = readProfiles().find((item) => item.username === username.trim().toLowerCase());
    if (!profile || profile.passwordHash !== await hashPassword(password, profile.salt)) {
      throw new Error("Incorrect username or password.");
    }
    return this.publicProfile(profile);
  },

  async updateProfile(id, updates) {
    const profiles = readProfiles();
    const index = profiles.findIndex((profile) => profile.id === id);
    if (index < 0) throw new Error("Profile not found.");
    const current = profiles[index];
    const next = { ...current };
    if (updates.name?.trim()) next.name = updates.name.trim();
    if (updates.password) next.passwordHash = await hashPassword(updates.password, current.salt);
    profiles[index] = next;
    writeProfiles(profiles);
    return this.publicProfile(next);
  },

  deleteClient(id) {
    const profile = readProfiles().find((item) => item.id === id);
    if (!profile || profile.role !== "client") throw new Error("Only client profiles can be deleted.");
    writeProfiles(readProfiles().filter((item) => item.id !== id));
  },

  publicProfile({ passwordHash, salt, ...profile }) {
    return profile;
  }
};
