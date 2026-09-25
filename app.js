/*
  Flight Plan — data layer (Supabase-backed)
  -------------------------------------------
  Every page loads, in order:
    1. the Supabase client library (CDN)
    2. assets/supabase-config.js   (your project URL + anon key)
    3. this file

  All functions here are async (they're doing real network calls now),
  so every page that uses them awaits the result.
*/

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const FP = (() => {

  // ---- session / auth ----
  async function getSession() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data: profile, error } = await sb
      .from('profiles')
      .select('username, role')
      .eq('id', session.user.id)
      .single();
    if (error || !profile) return null;
    return { id: session.user.id, email: session.user.email, username: profile.username, role: profile.role };
  }

  async function signUp({ email, password, username }) {
    if (!email || !password || !username) return { ok: false, error: 'Fill in every field.' };
    const { error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { username } }
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function login(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: error.message };
    const session = await getSession();
    return { ok: true, role: session ? session.role : 'user' };
  }

  async function logout() {
    await sb.auth.signOut();
  }

  // Redirects to login (or the right home page) if the check fails.
  // Returns the session object on success, so pages can `const s = await FP.requireAuth();`
  async function requireAuth(role) {
    const s = await getSession();
    if (!s) { window.location.href = 'login.html'; return null; }
    if (role && s.role !== role) {
      window.location.href = s.role === 'admin' ? 'admin.html' : 'appointments.html';
      return null;
    }
    return s;
  }

  // Fills a <span id="navAuth"> with Login, or with a home link + Log out.
  async function renderNavAuth(elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const s = await getSession();
    if (s) {
      const homeHref = s.role === 'admin' ? 'admin.html' : 'appointments.html';
      const homeLabel = s.role === 'admin' ? 'Admin' : 'My Appointments';
      el.innerHTML = `<a href="${homeHref}">${homeLabel}</a><a href="#" id="fpLogoutLink">Log out</a>`;
      const logoutLink = document.getElementById('fpLogoutLink');
      logoutLink.addEventListener('click', async (e) => {
        e.preventDefault();
        await logout();
        window.location.href = 'index.html';
      });
    } else {
      el.innerHTML = '<a href="login.html">Login</a>';
    }
  }

  // ---- classes ----
  async function getClasses() {
    const { data, error } = await sb.from('classes').select('*').order('name');
    return error ? [] : data;
  }
  async function addClass({ name, description }) {
    const { error } = await sb.from('classes').insert({ name, description });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  async function deleteClass(id) {
    const { error } = await sb.from('classes').delete().eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  // ---- appointment slots + bookings ----
  // Each slot comes back with a `.bookings` array of { id, user_id, profiles: { username } }
  async function getSlots() {
    const { data: slots, error } = await sb.from('slots').select('*').order('date').order('time');
    if (error) return [];
    const { data: bookings } = await sb.from('bookings').select('id, slot_id, user_id, profiles(username)');
    return slots.map(s => ({
      ...s,
      bookings: (bookings || []).filter(b => b.slot_id === s.id)
    }));
  }
  async function addSlot({ classId, date, time, capacity }) {
    const { error } = await sb.from('slots').insert({
      class_id: classId, date, time, capacity: Math.max(1, Number(capacity) || 1)
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  async function deleteSlot(id) {
    const { error } = await sb.from('slots').delete().eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  async function bookSlot(slot, userId) {
    if (slot.bookings.length >= slot.capacity) return { ok: false, error: 'That time is full.' };
    const { error } = await sb.from('bookings').insert({ slot_id: slot.id, user_id: userId });
    if (error) {
      if (error.code === '23505') return { ok: false, error: "You're already signed up for this one." };
      return { ok: false, error: error.message };
    }
    return { ok: true };
  }
  async function cancelBooking(slotId, userId) {
    await sb.from('bookings').delete().eq('slot_id', slotId).eq('user_id', userId);
  }

  // ---- calendar events ----
  async function getEvents() {
    const { data, error } = await sb.from('events').select('*').order('date');
    return error ? [] : data;
  }
  async function addEvent({ date, title, description }) {
    const { error } = await sb.from('events').insert({ date, title, description });
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  async function deleteEvent(id) {
    const { error } = await sb.from('events').delete().eq('id', id);
    return error ? { ok: false, error: error.message } : { ok: true };
  }

  return {
    getSession, signUp, login, logout, requireAuth, renderNavAuth,
    getClasses, addClass, deleteClass,
    getSlots, addSlot, deleteSlot, bookSlot, cancelBooking,
    getEvents, addEvent, deleteEvent
  };
})();
