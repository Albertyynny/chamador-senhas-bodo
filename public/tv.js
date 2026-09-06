import {getState,formatTime,escapeHtml as esc,statusLabels} from './app.js';
import {announce,stopAnnouncement,unlockAudio} from './audio.js';
import {AnnouncementQueue} from './announcement-queue.js';
const $ = id => document.getElementById(id);
let soundOn = false, sessionId, state, displaying = false, lastSuccess = 0;
const wait = ms => new Promise(resolve => setTimeout(resolve,ms));
function showCall(call) {
  $('now').innerHTML = call ? `<div class="label">${call.status === 'em_atendimento' ? 'Em atendimento' : 'Senha chamada'}</div><div class="code">${esc(call.code)}</div>${call.patientName ? `<div class="patient">${esc(call.patientName)}</div>` : ''}<div class="desk">${esc(call.desk)}</div><div class="service">${esc(call.serviceName)}</div>` : '<div class="tv-empty">Aguardando chamada</div><div class="tv-empty-sub">A próxima senha aparecerá aqui.</div>';
}
function voiceError(error) {
  $('voiceStatus').textContent = error.message || String(error);
  $('voiceStatus').className = 'tv-notice error';
}
const announcements = new AnnouncementQueue(async call => {
  displaying = true; showCall(call);
  const code = call.code.replace(/([A-Z])/g,'$1 ').replace(/(\d)/g,'$1 ');
  const speech = soundOn ? announce(`Atenção. ${call.patientName ? call.patientName + '. ' : ''}Senha ${code}. Dirija-se a ${call.desk}.`) : Promise.resolve({});
  const [result] = await Promise.all([speech,wait(4000)]);
  if (result?.error) voiceError(result.error);
  await wait(600);
},voiceError,() => { displaying = false; if (state) showCall(state.current); });
$('sound').onclick = () => {
  soundOn = !soundOn;
  $('sound').textContent = soundOn ? '🔊 Som ativado' : '🔇 Ativar som';
  $('voiceStatus').className = 'tv-notice';
  $('voiceStatus').textContent = soundOn ? 'As próximas chamadas serão anunciadas uma por vez.' : 'Som desativado. As chamadas continuam na tela.';
  if (soundOn) unlockAudio().catch(voiceError); else stopAnnouncement();
};
$('full').onclick = () => document.documentElement.requestFullscreen?.().catch(() => {});
function render(next) {
  state = next;
  if (sessionId !== state.session.id) {
    stopAnnouncement(); announcements.reset(state.cursor);
    sessionId = state.session.id;
  } else if (state.reset) {
    stopAnnouncement(); announcements.reset(state.cursor);
  }
  announcements.enqueue(state.announcements);
  if (!displaying) showCall(state.current);
  $('last').innerHTML = state.lastCalls.length ? state.lastCalls.map(call => `<div class="last-item"><strong>${esc(call.code)}</strong><span>${esc(call.patientName || '')}<br>${esc(call.desk)}<br><small>${esc(formatTime(call.calledAt))}${call.recalled ? ' • Rechamada' : ''}</small></span></div>`).join('') : '<p>Nenhuma chamada ainda.</p>';
  $('tvDesks').innerHTML = state.active.map(ticket => `<div class="tv-desk-card"><p>${esc(ticket.desk)}</p><strong>${esc(ticket.code)}</strong><p>${esc(ticket.serviceName)}</p><small>${esc(statusLabels[ticket.status])}</small></div>`).join('');
  $('ticker').innerHTML = '<strong>Em espera</strong>' + state.services.map(service => `<span>${esc(service.name)}: <b>${service.waiting}</b></span>`).join('');
  $('tvConnection').className = 'tv-notice';
  $('tvConnection').textContent = state.session.closedAt ? 'Atendimento do dia encerrado.' : 'Painel conectado';
}
async function poll() {
  try {
    const next = await getState(null,sessionId ? {session:sessionId,after:String(announcements.cursor)} : {});
    lastSuccess = Date.now(); render(next);
  } catch {
    $('tvConnection').className = 'tv-notice error';
    $('tvConnection').textContent = 'Sem conexão. As informações podem estar desatualizadas. Tentando reconectar...';
  } finally { setTimeout(poll,1200); }
}
function clock() {
  const date = new Date();
  $('clock').textContent = date.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  $('date').textContent = date.toLocaleDateString('pt-BR',{weekday:'long',day:'2-digit',month:'long',year:'numeric'});
  if (lastSuccess && Date.now() - lastSuccess > 10000) {
    $('tvConnection').className = 'tv-notice error';
    $('tvConnection').textContent = 'Sem atualização recente. Confira a conexão com a internet.';
  }
}
poll(); clock(); setInterval(clock,1000);
