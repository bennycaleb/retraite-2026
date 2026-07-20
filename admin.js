const TOKEN_KEY = 'retraite_admin_token';
let allRegistrations = [];
let currentFilter = 'all';

const loginPanel = document.getElementById('login-panel');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const serverError = document.getElementById('server-error');
const btnLogin = document.getElementById('btn-login');
const tableBody = document.getElementById('table-body');
const detailPanel = document.getElementById('detail-panel');

const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:8080' : '';

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

function authHeaders() {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  };
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRubles(n) {
  return Number(n).toLocaleString('fr-FR') + ' ₽';
}

function showDashboard() {
  loginPanel.classList.add('is-hidden');
  loginPanel.hidden = true;
  dashboard.classList.remove('is-hidden');
  dashboard.hidden = false;
}

function showLogin() {
  loginPanel.classList.remove('is-hidden');
  loginPanel.hidden = false;
  dashboard.classList.add('is-hidden');
  dashboard.hidden = true;
}

function showServerError(message) {
  serverError.textContent = message;
  serverError.hidden = false;
  loginError.hidden = true;
}

function hideErrors() {
  loginError.hidden = true;
  serverError.hidden = true;
}

async function apiFetch(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, options);
  if (res.status === 401) {
    clearToken();
    showLogin();
    throw new Error('Non autorisé');
  }
  return res;
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideErrors();

  if (window.location.protocol === 'file:') {
    showServerError('Ouvrez cette page via http://localhost:8080/admin.html et lancez npm start dans le dossier du projet.');
    return;
  }

  const password = document.getElementById('password').value.trim();
  btnLogin.disabled = true;
  btnLogin.textContent = 'Connexion...';

  try {
    const res = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      loginError.hidden = false;
      return;
    }

    const { token } = await res.json();
    setToken(token);
    showDashboard();
    await loadRegistrations();
  } catch {
    showServerError('Impossible de se connecter. Vérifiez que le serveur tourne (npm start).');
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Se connecter';
  }
});

document.getElementById('btn-logout').addEventListener('click', () => {
  clearToken();
  showLogin();
  document.getElementById('password').value = '';
});

document.getElementById('btn-refresh').addEventListener('click', loadRegistrations);

document.getElementById('btn-export').addEventListener('click', async () => {
  try {
    const res = await apiFetch('/api/admin/export.csv', {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inscriptions.xls';
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    alert('Impossible d\'exporter le CSV');
  }
});

document.querySelectorAll('.filter-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTable();
  });
});

document.getElementById('detail-close').addEventListener('click', () => {
  detailPanel.hidden = true;
});

async function loadRegistrations() {
  try {
    const res = await apiFetch('/api/admin/inscriptions', {
      headers: authHeaders(),
    });
    allRegistrations = await res.json();
    updateStats();
    renderTable();
  } catch (err) {
    if (err.message !== 'Non autorisé') {
    tableBody.innerHTML = '<tr><td colspan="8" class="empty">Erreur de chargement — relancez le serveur</td></tr>';
    }
  }
}

function updateStats() {
  const pending = allRegistrations.filter((r) => r.statut === 'En attente');
  const paid = allRegistrations.filter((r) => r.statut === 'Payé');

  document.getElementById('stat-total').textContent = allRegistrations.length;
  document.getElementById('stat-pending').textContent = pending.length;
  document.getElementById('stat-paid').textContent = paid.length;
  document.getElementById('stat-revenue').textContent = formatRubles(
    paid.reduce((sum, r) => sum + r.total, 0)
  );
}

function renderTable() {
  const filtered =
    currentFilter === 'all'
      ? allRegistrations
      : allRegistrations.filter((r) => r.statut === currentFilter);

  if (filtered.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="8" class="empty">Aucune inscription pour le moment</td></tr>';
    return;
  }

  tableBody.innerHTML = filtered
    .map(
      (r) => `
    <tr>
      <td>${formatDate(r.date)}</td>
      <td>
        <span class="row-name" data-id="${r.id}">${r.prenom} ${r.nom}</span>
      </td>
      <td>
        <div>${r.email}</div>
        <div class="row-contact">${r.telephone}</div>
      </td>
      <td><strong>${formatRubles(r.total)}</strong></td>
      <td>
        <span class="status-badge ${r.preuveEnvoyee ? 'paid' : 'pending'}">${r.preuveEnvoyee ? 'Reçue' : 'Non'}</span>
      </td>
      <td>
        <span class="status-badge ${r.statut === 'Payé' ? 'paid' : 'pending'}">${r.statut}</span>
      </td>
      <td>
        ${
          r.statut === 'En attente'
            ? `<button class="btn btn-sm btn-paid" data-confirm="${r.id}">Confirmer Payé</button>`
            : `<button class="btn btn-sm btn-outline" data-revert="${r.id}">Remettre en attente</button>`
        }
      </td>
    </tr>
  `
    )
    .join('');

  tableBody.querySelectorAll('[data-id]').forEach((el) => {
    el.addEventListener('click', () => showDetail(el.dataset.id));
  });

  tableBody.querySelectorAll('[data-confirm]').forEach((btn) => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.confirm, 'Payé'));
  });

  tableBody.querySelectorAll('[data-revert]').forEach((btn) => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.revert, 'En attente'));
  });
}

function showDetail(id) {
  const r = allRegistrations.find((x) => x.id === id);
  if (!r) return;

  document.getElementById('detail-name').textContent = `${r.prenom} ${r.nom}`;
  document.getElementById('detail-body').innerHTML = `
    <div class="detail-row"><label>Date</label><p>${formatDate(r.date)}</p></div>
    <div class="detail-row"><label>Email</label><p>${r.email}</p></div>
    <div class="detail-row"><label>Téléphone</label><p>${r.telephone}</p></div>
    <div class="detail-row"><label>Remarques</label><p>${r.remarques || '—'}</p></div>
    <div class="detail-row"><label>Partenaire</label><p>${r.partenaire ? 'Oui — ' + formatRubles(r.montantPartenaire) : 'Non'}</p></div>
    <div class="detail-row"><label>Total</label><p><strong>${formatRubles(r.total)}</strong></p></div>
    <div class="detail-row"><label>Preuve de paiement</label><p><span class="status-badge ${r.preuveEnvoyee ? 'paid' : 'pending'}">${r.preuveEnvoyee ? 'Capture reçue' : 'Pas encore envoyée'}</span>${r.datePreuve ? ' — ' + formatDate(r.datePreuve) : ''}</p></div>
    <div class="detail-row"><label>Attentes</label><p>${r.attentes}</p></div>
    <div class="detail-row"><label>Statut</label><p><span class="status-badge ${r.statut === 'Payé' ? 'paid' : 'pending'}">${r.statut}</span></p></div>
    <div class="detail-actions">
      ${
        r.statut === 'En attente'
          ? `<button class="btn btn-primary btn-full" id="detail-confirm">Confirmer comme Payé</button>`
          : `<button class="btn btn-outline btn-full" id="detail-revert">Remettre en attente</button>`
      }
    </div>
  `;

  detailPanel.hidden = false;

  document.getElementById('detail-confirm')?.addEventListener('click', async () => {
    await updateStatus(r.id, 'Payé');
    detailPanel.hidden = true;
  });

  document.getElementById('detail-revert')?.addEventListener('click', async () => {
    await updateStatus(r.id, 'En attente');
    detailPanel.hidden = true;
  });
}

async function updateStatus(id, statut) {
  try {
    const res = await apiFetch(`/api/admin/inscriptions/${id}`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ statut }),
    });

    if (!res.ok) throw new Error();

    await loadRegistrations();
  } catch {
    alert('Erreur lors de la mise à jour');
  }
}

async function init() {
  if (window.location.protocol === 'file:') {
    showServerError('Ouvrez cette page via http://localhost:8080/admin.html et lancez npm start.');
    showLogin();
    return;
  }

  const forceLogin = new URLSearchParams(window.location.search).has('login');
  if (forceLogin) {
    clearToken();
    showLogin();
    return;
  }

  const token = getToken();
  if (!token) {
    showLogin();
    return;
  }

  try {
    const res = await apiFetch('/api/admin/inscriptions', { headers: authHeaders() });
    allRegistrations = await res.json();
    showDashboard();
    updateStats();
    renderTable();
  } catch {
    showLogin();
  }
}

init();
