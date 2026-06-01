// ── CONFIGURACIÓN GOOGLE ──────────────────────────────────────────────────────
const GOOGLE_CLIENT_ID = '219184382354-l36ao2j9t122s362j21lc9ldvuvieher.apps.googleusercontent.com';
const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.send'
].join(' ');

// ── CONFIGURACIÓN FIREBASE ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDXprqEP_0RjiNtbzlM03Owcm6wQexmfSE",
  authDomain: "mis-tareas-d19c3.firebaseapp.com",
  projectId: "mis-tareas-d19c3",
  storageBucket: "mis-tareas-d19c3.firebasestorage.app",
  messagingSenderId: "532398894195",
  appId: "1:532398894195:web:53d25e378171f553c7ce06"
};

// ── ESTADO ────────────────────────────────────────────────────────────────────
let tasks = [];
let filterVal = 'todas';
let accessToken = null;
let db = null;

// ── GOOGLE AUTH ───────────────────────────────────────────────────────────────
function signIn() {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: window.location.origin + window.location.pathname,
    response_type: 'token',
    scope: SCOPES,
    prompt: 'consent'
  });
  window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params;
}

function checkAuth() {
  const hash = new URLSearchParams(window.location.hash.replace('#', ''));
  const token = hash.get('access_token');
  if (token) {
    accessToken = token;
    localStorage.setItem('gToken', token);
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    accessToken = localStorage.getItem('gToken');
  }
  updateAuthBtn();
}

function updateAuthBtn() {
  const btn = document.getElementById('btn-auth');
  if (accessToken) {
    btn.textContent = '✓ Google conectado';
    btn.classList.add('connected');
    btn.onclick = () => {
      accessToken = null;
      localStorage.removeItem('gToken');
      updateAuthBtn();
    };
  } else {
    btn.textContent = 'Conectar Google';
    btn.classList.remove('connected');
    btn.onclick = signIn;
  }
}

// ── GOOGLE CALENDAR ───────────────────────────────────────────────────────────
async function createCalendarEvent(task) {
  if (!accessToken || !task.doDate || !task.startTime || !task.endTime) return null;

  const startDateTime = `${task.doDate}T${task.startTime}:00`;
  const endDateTime   = `${task.doDate}T${task.endTime}:00`;

  const event = {
    summary: task.title,
    description: `Prioridad: ${task.prior} | Categoría: ${task.cat}${task.deadline ? ' | Fecha límite: ' + fmt(task.deadline) : ''}`,
    start: { dateTime: startDateTime, timeZone: 'America/Argentina/Buenos_Aires' },
    end:   { dateTime: endDateTime,   timeZone: 'America/Argentina/Buenos_Aires' },
    colorId: task.cat === 'trabajo' ? '1' : '3'
  };

  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(event)
  });

  if (!res.ok) {
    if (res.status === 401) { accessToken = null; localStorage.removeItem('gToken'); updateAuthBtn(); }
    return null;
  }
  return await res.json();
}

// ── GMAIL ─────────────────────────────────────────────────────────────────────
async function sendWeeklyReport() {
async function sendWeeklyReport() {
  if (!accessToken) {
    alert('Conectá tu cuenta de Google primero.');
    return;
  }

  const report = buildReport();
  const subject = `Informe semanal de tareas - ${new Date().toLocaleDateString('es-AR')}`;
  const body = buildEmailBody(report);
  const to = 'mfontf2015@gmail.com';

  const messageParts = [
    `To: ${to}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
    '',
    body
  ];

  const message = messageParts.join('\r\n');
  const encoded = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ raw: encoded })
  });

  if (res.ok) {
    alert('✅ Informe enviado a tu Gmail.');
  } else {
    const err = await res.json();
    alert('❌ Error: ' + JSON.stringify(err));
  }
}
  function buildEmailBody(r) {
  const rows = r.pending.map(t =>
    `<tr><td>${t.title}</td><td>${t.cat}</td><td>${t.prior}</td><td>${t.deadline ? fmt(t.deadline) : '—'}</td></tr>`
  ).join('');
  return `
    <h2 style="color:#1D9E75">Informe semanal de tareas</h2>
    <p>${new Date().toLocaleDateString('es-AR', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}</p>
    <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%;margin:1rem 0">
      <tr style="background:#E1F5EE"><th>Completadas</th><th>Pendientes</th><th>Vencidas</th><th>Corrimiento prom.</th></tr>
      <tr><td>${r.done}</td><td>${r.pendingCount}</td><td>${r.overdue}</td><td>${r.avgShift} días</td></tr>
    </table>
    ${r.pending.length ? `<h3>Tareas pendientes</h3>
    <table border="1" cellpadding="6" style="border-collapse:collapse;width:100%">
      <tr style="background:#E1F5EE"><th>Tarea</th><th>Categoría</th><th>Prioridad</th><th>Fecha límite</th></tr>
      ${rows}
    </table>` : ''}
  `;
}

// ── TAREAS ────────────────────────────────────────────────────────────────────
async function addTask() {
  const title = document.getElementById('inp-title').value.trim();
  if (!title) { alert('Escribí un título para la tarea.'); return; }

  const task = {
    id: Date.now(),
    title,
    prior:     document.getElementById('inp-prior').value,
    cat:       document.getElementById('inp-cat').value,
    deadline:  document.getElementById('inp-deadline').value,
    doDate:    document.getElementById('inp-dodate').value,
    startTime: document.getElementById('inp-start').value,
    endTime:   document.getElementById('inp-end').value,
    status:    'pendiente',
    createdAt: new Date().toISOString(),
    completedAt: null
  };

  await saveTask(task);

  // Limpiar formulario
  ['inp-title','inp-deadline','inp-dodate','inp-start','inp-end'].forEach(id => {
    document.getElementById(id).value = '';
  });

  // Crear evento en Calendar
  const status = document.getElementById('cal-status');
  if (accessToken && task.doDate && task.startTime && task.endTime) {
    status.textContent = '⏳ Creando evento en Google Calendar...';
    const ev = await createCalendarEvent(task);
    status.textContent = ev ? '✅ Evento creado en Google Calendar.' : '❌ No se pudo crear el evento.';
    setTimeout(() => { status.textContent = ''; }, 4000);
  } else if (!accessToken && task.doDate && task.startTime) {
    status.textContent = 'Conectá Google para crear el evento automáticamente.';
    setTimeout(() => { status.textContent = ''; }, 4000);
  }

  render();
}

function deleteTask(id) {
  const t = tasks.find(t => t.id === id);
  if (t && t._docId) removeTask(t._docId);
}

function toggleDone(id) {
  const t = tasks.find(t => t.id === id);
  if (!t || !t._docId) return;
  const newStatus = t.status !== 'completada' ? 'completada' : 'pendiente';
  const completedAt = newStatus === 'completada' ? new Date().toISOString() : null;
  updateTask(t._docId, { status: newStatus, completedAt });
}

function changeStatus(id, val) {
  const t = tasks.find(t => t.id === id);
  if (!t || !t._docId) return;
  const completedAt = val === 'completada' ? new Date().toISOString() : null;
  updateTask(t._docId, { status: val, completedAt });
}

function setFilter(v, el) {
  filterVal = v;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  render();
}

function showTab(tab) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('view-' + tab).classList.add('active');
  document.getElementById('tab-' + tab).classList.add('active');
  if (tab === 'informe') renderReport();
}

// ── RENDER TAREAS ─────────────────────────────────────────────────────────────
function render() {
  let list = tasks;
  if (filterVal === 'trabajo')    list = tasks.filter(t => t.cat === 'trabajo');
  else if (filterVal === 'estudio')    list = tasks.filter(t => t.cat === 'estudio');
  else if (filterVal === 'pendiente')  list = tasks.filter(t => t.status === 'pendiente');
  else if (filterVal === 'en progreso') list = tasks.filter(t => t.status === 'en progreso');
  else if (filterVal === 'completada') list = tasks.filter(t => t.status === 'completada');

  const done = tasks.filter(t => t.status === 'completada').length;
  const pct  = tasks.length ? Math.round(done / tasks.length * 100) : 0;
  document.getElementById('pbar').style.width = pct + '%';
  document.getElementById('plabel').textContent = `${done} de ${tasks.length} completadas`;

  const el = document.getElementById('tasks-list');
  if (!list.length) {
    el.innerHTML = '<div class="empty">No hay tareas aquí todavía.</div>';
    return;
  }

  el.innerHTML = list.map(t => {
    const ds = dateStatus(t.deadline);
    const dateHtml = t.deadline
      ? `<span class="date-tag ${ds}">${ds === 'vencido' ? '⚠ Vencido' : 'Límite'}: ${fmt(t.deadline)}</span>`
      : '';
    const doHtml = t.doDate
      ? `<span class="date-tag">📅 Realizar: ${fmt(t.doDate)}${t.startTime ? ' ' + t.startTime : ''}${t.endTime ? '–' + t.endTime : ''}</span>`
      : '';
    return `
      <div class="task-card ${t.status === 'completada' ? 'done' : ''}">
        <div class="task-check ${t.status === 'completada' ? 'checked' : ''}"
             onclick="toggleDone(${t.id})"
             role="checkbox"
             aria-checked="${t.status === 'completada'}"
             aria-label="Marcar como completada">
          ${t.status === 'completada' ? '✓' : ''}
        </div>
        <div class="task-body">
          <div class="task-title">${t.title}</div>
          <div class="task-meta">
            <span class="badge badge-${t.prior}">${cap(t.prior)}</span>
            <span class="badge badge-${t.cat}">${cap(t.cat)}</span>
            <select class="status-select" onchange="changeStatus(${t.id}, this.value)" aria-label="Estado">
              <option value="pendiente" ${t.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="en progreso" ${t.status === 'en progreso' ? 'selected' : ''}>En progreso</option>
              <option value="completada" ${t.status === 'completada' ? 'selected' : ''}>Completada</option>
            </select>
            ${dateHtml}${doHtml}
          </div>
        </div>
        <div class="task-actions">
          <button class="btn-icon" onclick="deleteTask(${t.id})" aria-label="Eliminar">🗑</button>
        </div>
      </div>`;
  }).join('');
}

// ── INFORME ───────────────────────────────────────────────────────────────────
function buildReport() {
  const now = new Date();
  const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const recent = tasks.filter(t => {
    const d = t.completedAt ? new Date(t.completedAt) : (t.createdAt ? new Date(t.createdAt) : null);
    return d && d >= weekAgo;
  });

  const done    = tasks.filter(t => t.status === 'completada').length;
  const pending = tasks.filter(t => t.status !== 'completada');
  const overdue = pending.filter(t => t.deadline && t.deadline < today()).length;

  // Corrimiento: días entre fecha planificada (doDate) y completedAt
  const shifts = tasks
    .filter(t => t.status === 'completada' && t.doDate && t.completedAt)
    .map(t => {
      const planned   = new Date(t.doDate);
      const completed = new Date(t.completedAt);
      return Math.round((completed - planned) / (1000 * 60 * 60 * 24));
    });

  const avgShift = shifts.length
    ? Math.round(shifts.reduce((a, b) => a + b, 0) / shifts.length)
    : 0;

  return { done, pendingCount: pending.length, overdue, avgShift, pending };
}

function renderReport() {
  const r = buildReport();
  document.getElementById('informe-content').innerHTML = `
    <div class="stat-grid">
      <div class="stat-box">
        <div class="stat-label">Completadas</div>
        <div class="stat-value green">${r.done}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Pendientes</div>
        <div class="stat-value">${r.pendingCount}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Vencidas sin completar</div>
        <div class="stat-value red">${r.overdue}</div>
      </div>
      <div class="stat-box">
        <div class="stat-label">Corrimiento promedio</div>
        <div class="stat-value amber">${r.avgShift} días</div>
      </div>
    </div>
    ${r.pending.length ? `
    <h3 style="font-size:13px;font-weight:600;margin-bottom:.5rem;color:var(--text-muted)">Tareas pendientes</h3>
    <ul class="informe-list">
      ${r.pending.map(t => `<li>${t.title} — <strong>${t.cat}</strong>${t.deadline ? ' · límite ' + fmt(t.deadline) : ''}</li>`).join('')}
    </ul>` : '<p style="font-size:13px;color:var(--text-muted)">¡No hay tareas pendientes! 🎉</p>'}
  `;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function save() {} // Las tareas se guardan en Firebase automáticamente
function today()  { return new Date().toISOString().split('T')[0]; }
function cap(s)   { return s.charAt(0).toUpperCase() + s.slice(1); }
function fmt(d)   { if (!d) return ''; const [y,m,dd] = d.split('-'); return `${dd}/${m}/${y}`; }
function dateStatus(d) {
  if (!d) return '';
  const t = today();
  if (d < t) return 'vencido';
  const diff = (new Date(d) - new Date(t)) / (1000 * 60 * 60 * 24);
  return diff <= 3 ? 'proximo' : '';
}

// ── FIREBASE ──────────────────────────────────────────────────────────────────
async function initFirebase() {
  const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
  const { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');

  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);

  // Escuchar cambios en tiempo real
  const colRef = collection(db, 'tasks');
  onSnapshot(colRef, (snapshot) => {
    tasks = snapshot.docs.map(d => ({ ...d.data(), _docId: d.id }));
    render();
  });

  window._fs = { collection, addDoc, updateDoc, deleteDoc, doc, colRef };
}

async function saveTask(task) {
  const { collection, addDoc } = window._fs;
  const colRef = window._fs.colRef;
  await addDoc(colRef, task);
}

async function updateTask(docId, data) {
  const { doc, updateDoc } = window._fs;
  await updateDoc(doc(db, 'tasks', docId), data);
}

async function removeTask(docId) {
  const { doc, deleteDoc } = window._fs;
  await deleteDoc(doc(db, 'tasks', docId));
}

// ── SERVICE WORKER ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ── INIT ──────────────────────────────────────────────────────────────────────
checkAuth();
initFirebase();
