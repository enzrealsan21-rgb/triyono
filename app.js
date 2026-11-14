const $ = (id) => document.getElementById(id);
let currentUser = null;
let currentConversation = null;
let authMode = "login";
let toastTimer;

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.add("hidden"), 3000);
}
async function api(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Terjadi kesalahan.");
  return data;
}
function setAuth(user) {
  currentUser = user;
  $("loginOpen").classList.toggle("hidden", !!user);
  $("registerOpen").classList.toggle("hidden", !!user);
  $("logoutBtn").classList.toggle("hidden", !user);
  $("navUser").textContent = user ? `Halo, ${user.name}` : "";
  $("workspaceGate").classList.toggle("hidden", !!user);
  $("appPanel").classList.toggle("hidden", !user);
  $("adminPanel").classList.toggle("hidden", !user || user.role !== "admin");
  if (user) {
    $("sideName").textContent = user.name;
    $("sideRole").textContent = user.role === "admin" ? "Administrator" : "Pengguna";
    $("avatar").textContent = user.name.slice(0,1).toUpperCase();
    loadHistory();
    if (user.role === "admin") loadAdmin();
  }
}
function openAuth(mode) {
  authMode = mode;
  const isRegister = mode === "register";
  $("authTitle").textContent = isRegister ? "Buat akun TRIYONO AI" : "Selamat datang kembali";
  $("authSubtitle").textContent = isRegister ? "Daftar untuk menyimpan percakapan dan mengakses ruang AI." : "Masuk untuk membuka ruang kerja AI kamu.";
  $("nameField").classList.toggle("hidden", !isRegister);
  $("authName").required = isRegister;
  $("authPassword").autocomplete = isRegister ? "new-password" : "current-password";
  $("authSubmit").textContent = isRegister ? "Buat akun" : "Masuk";
  $("switchText").textContent = isRegister ? "Sudah punya akun?" : "Belum punya akun?";
  $("switchAuth").textContent = isRegister ? "Masuk" : "Daftar";
  $("authError").textContent = "";
  $("authModal").classList.remove("hidden");
  setTimeout(() => $(isRegister ? "authName" : "authEmail").focus(), 50);
}
function closeAuth() { $("authModal").classList.add("hidden"); }
async function loadHistory() {
  try {
    const data = await api("/api/conversations");
    const list = $("historyList");
    list.replaceChildren();
    data.conversations.forEach(item => {
      const button = document.createElement("button");
      button.className = "history-item" + (item.id === currentConversation ? " active" : "");
      button.textContent = item.title;
      button.title = item.title;
      button.addEventListener("click", () => openConversation(item.id));
      list.appendChild(button);
    });
  } catch (e) { toast(e.message); }
}
function addBubble(role, content) {
  const welcome = $("chatMessages").querySelector(".welcome-message");
  if (welcome) welcome.remove();
  const row = document.createElement("div");
  row.className = "chat-message " + (role === "user" ? "user" : "assistant");
  const avatar = document.createElement("div");
  avatar.className = "chat-avatar";
  avatar.textContent = role === "user" ? "K" : "✦";
  const bubble = document.createElement("div");
  bubble.className = "chat-bubble";
  bubble.textContent = content;
  row.append(avatar, bubble);
  $("chatMessages").appendChild(row);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
}
function showWelcome() {
  $("chatMessages").innerHTML = `<div class="welcome-message"><div class="welcome-symbol">✦</div><h3>Ada yang bisa saya bantu?</h3><p>Tanyakan sesuatu, jelajahi ide, atau mulai dari salah satu contoh berikut.</p><div class="prompt-chips"><button data-prompt="Jelaskan kecerdasan buatan dengan bahasa sederhana.">Jelaskan tentang AI</button><button data-prompt="Bantu saya membuat rencana belajar yang teratur.">Buat rencana belajar</button><button data-prompt="Berikan 5 ide proyek teknologi sederhana.">Cari ide proyek</button></div></div>`;
}
async function newConversation() {
  currentConversation = null;
  showWelcome();
  await loadHistory();
  $("chatInput").focus();
}
async function openConversation(id) {
  try {
    const data = await api(`/api/conversations/${id}/messages`);
    currentConversation = id;
    $("chatMessages").replaceChildren();
    data.messages.forEach(m => addBubble(m.role, m.content));
    await loadHistory();
  } catch (e) { toast(e.message); }
}
async function sendChat(message) {
  if (!currentUser) return openAuth("login");
  const text = message.trim();
  if (!text) return;
  addBubble("user", text);
  $("chatInput").value = "";
  $("chatInput").style.height = "auto";
  const pending = document.createElement("div");
  pending.className = "chat-message assistant";
  pending.id = "pendingReply";
  pending.innerHTML = `<div class="chat-avatar">✦</div><div class="chat-bubble">TRIYONO AI sedang berpikir...</div>`;
  $("chatMessages").appendChild(pending);
  $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
  $("chatForm").querySelector("button").disabled = true;
  try {
    const data = await api("/api/chat", { method: "POST", body: JSON.stringify({ message: text, conversationId: currentConversation }) });
    currentConversation = data.conversationId;
    $("pendingReply")?.remove();
    addBubble("assistant", data.reply);
    if (data.demo) toast("Mode demo: API AI belum diatur.");
    await loadHistory();
  } catch (e) {
    $("pendingReply")?.remove();
    addBubble("assistant", e.message);
  } finally {
    $("chatForm").querySelector("button").disabled = false;
    $("chatInput").focus();
  }
}
async function loadAdmin() {
  try {
    const data = await api("/api/admin/overview");
    $("statUsers").textContent = data.stats.users;
    $("statChats").textContent = data.stats.conversations;
    $("statMessages").textContent = data.stats.messages;
    const body = $("usersTable");
    body.replaceChildren();
    data.users.forEach(user => {
      const tr = document.createElement("tr");
      [user.name, user.email, user.role, new Date(user.created_at + "Z").toLocaleDateString("id-ID")].forEach(value => {
        const td = document.createElement("td"); td.textContent = value; tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  } catch (e) { toast(e.message); }
}

$("loginOpen").addEventListener("click", () => openAuth("login"));
$("registerOpen").addEventListener("click", () => openAuth("register"));
$("gateRegister").addEventListener("click", () => openAuth("register"));
$("heroStart").addEventListener("click", () => {
  $("workspace").scrollIntoView({ behavior: "smooth" });
  if (!currentUser) openAuth("register");
  else $("chatInput").focus();
});
$("switchAuth").addEventListener("click", () => openAuth(authMode === "login" ? "register" : "login"));
document.querySelectorAll("[data-close]").forEach(el => el.addEventListener("click", closeAuth));
$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("authError").textContent = "";
  const payload = { email: $("authEmail").value, password: $("authPassword").value };
  if (authMode === "register") payload.name = $("authName").value;
  try {
    const data = await api(`/api/${authMode}`, { method: "POST", body: JSON.stringify(payload) });
    closeAuth(); $("authForm").reset(); setAuth(data.user); toast("Berhasil masuk ke TRIYONO AI.");
  } catch (e) { $("authError").textContent = e.message; }
});
$("logoutBtn").addEventListener("click", async () => {
  try { await api("/api/logout", { method: "POST" }); currentConversation = null; setAuth(null); showWelcome(); toast("Kamu sudah keluar."); }
  catch (e) { toast(e.message); }
});
$("chatForm").addEventListener("submit", e => { e.preventDefault(); sendChat($("chatInput").value); });
$("chatInput").addEventListener("input", () => {
  $("chatInput").style.height = "auto";
  $("chatInput").style.height = Math.min($("chatInput").scrollHeight, 110) + "px";
});
$("newChat").addEventListener("click", newConversation);
$("clearChat").addEventListener("click", async () => {
  if (!currentConversation) return newConversation();
  if (!confirm("Hapus percakapan ini dari riwayat?")) return;
  try {
    await api(`/api/conversations/${currentConversation}`, { method: "DELETE" });
    currentConversation = null; showWelcome(); await loadHistory(); toast("Percakapan dihapus.");
  } catch (e) { toast(e.message); }
});
$("refreshAdmin").addEventListener("click", loadAdmin);
document.addEventListener("click", e => {
  const chip = e.target.closest("[data-prompt]");
  if (chip) sendChat(chip.dataset.prompt);
});
$("year").textContent = new Date().getFullYear();

(async function init() {
  try {
    const data = await api("/api/me");
    setAuth(data.user);
  } catch { setAuth(null); }
})();
