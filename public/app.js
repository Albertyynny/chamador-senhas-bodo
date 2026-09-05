const API = '/api/state';

export async function getState(pin = null) {
  const res = await fetch(pin ? `${API}?admin=1` : API, {
    headers: pin ? { 'x-panel-pin': pin } : {},
    cache: 'no-store'
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao carregar.');
  return data;
}

export async function postAction(action, payload = {}, pin = null) {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(pin ? { 'x-panel-pin': pin } : {})
    },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Não foi possível concluir.');
  return data;
}

export function formatTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

export function toast(message, error = false) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = `toast show${error ? ' error' : ''}`;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.className = 'toast', 3200);
}
