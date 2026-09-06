import {getState, getHistory, postAction, formatDateTime, escapeHtml as esc, toast, statusLabels, normalizeDesk} from './app.js';
import {getPrinterSettings, printTicket} from './printer.js';
const $ = id => document.getElementById(id);
let pin = sessionStorage.getItem('panelPin') || '';
let state = null, busy = false, refreshing = false, history = null, historyRequest = 0, historyLoading = null;
let editingAppointment = null;
try { $('desk').value = localStorage.getItem('panelDesk') || ''; } catch {}
const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateLabel = date => date.split('-').reverse().join('/');
const current = () => state?.active.find(ticket => ticket.deskId === normalizeDesk($('desk').value));
const badge = status => `<span class="chip status-${esc(status)}">${esc(statusLabels[status] || status)}</span>`;
function showLogin() {
  $('login').classList.add('show');
  $('pin').focus();
}
function controls() {
  const ticket = current();
  const locked = busy || !state || !pin || !!state.session.closedAt;
  const noDesk = !normalizeDesk($('desk').value);
  $('next').disabled = locked || noDesk || !!ticket || !$('service').value;
  $('callSpecific').disabled = locked || noDesk || !!ticket;
  $('recall').disabled = locked || ticket?.status !== 'chamada';
  $('start').disabled = locked || ticket?.status !== 'chamada';
  $('absent').disabled = locked || ticket?.status !== 'chamada';
  $('finish').disabled = locked || ticket?.status !== 'em_atendimento';
  $('cancelCurrent').disabled = locked || !ticket;
  $('desk').disabled = busy; $('service').disabled = busy;
  for (const id of ['closeDay','openDay','reopenDay']) $(id).disabled = busy || !state;
  for (const id of ['sectorName','sectorPrefix','createSector']) $(id).disabled = busy || !state || !pin;
  for (const id of ['appointmentService','appointmentRoom','appointmentDate','appointmentTime','appointmentDuration','cancelAppointmentEdit']) $(id).disabled = busy || !state || !pin;
  $('appointmentName').disabled = busy || !state || !pin || !!editingAppointment;
  $('saveAppointment').disabled = busy || !state || !pin || noDesk;
  $('agendaDesk').textContent = noDesk ? 'Informe seu guichê no início do painel para cadastrar pessoas.' : `Guichê responsável pelo cadastro: ${$('desk').value.trim()}`;
  document.querySelectorAll('[data-appointment-action]').forEach(button => {
    const isCheckin = button.dataset.appointmentAction === 'appointment_checkin';
    button.disabled = busy || !state || !pin || noDesk || (isCheckin && (!!state.session.closedAt || state.session.date !== state.today));
  });
  document.querySelectorAll('[data-cancel],[data-return]').forEach(button => { button.disabled = locked; });
}
function renderDesk() {
  const ticket = current();
  $('current').innerHTML = ticket ? `<div class="big-call"><div class="code">${esc(ticket.code)}</div><div class="patient-name">${esc(ticket.patientName)}</div><div class="desk">${esc(ticket.desk)}</div><p>${esc(ticket.serviceName)}</p>${badge(ticket.status)}</div>` : '<div class="empty">Guichê livre. Escolha a fila e chame a próxima senha.</div>';
  const waiting = state?.tickets.filter(ticket => ticket.status === 'aguardando' && ticket.serviceId === $('service').value) || [];
  $('queue').innerHTML = waiting.length ? waiting.map(ticket => `<div class="queue-item"><div><strong>${esc(ticket.code)}</strong> ${esc(ticket.patientName)}<div class="small muted">${esc(formatDateTime(ticket.createdAt))}</div></div><button class="btn btn-danger" data-cancel="${esc(ticket.id)}">Cancelar</button></div>`).join('') : '<div class="empty">Nenhuma senha aguardando neste setor.</div>';
  controls();
}
function render(next) {
  if (state && next.revision < state.revision) return;
  state = next;
  if (!$('agendaDate').value) $('agendaDate').value = state.today || today();
  if (!$('appointmentDate').value) $('appointmentDate').value = state.today || today();
  $('appointmentDate').min = state.today || today();
  const appointmentService = $('appointmentService').value;
  $('appointmentService').replaceChildren(new Option('Selecione o setor',''),...state.services.map(service => new Option(service.name,service.id)));
  if (state.services.some(service => service.id === appointmentService)) $('appointmentService').value = appointmentService;
  renderAppointments();
  $('sectorRows').innerHTML = state.services.map(service => `<tr><td>${esc(service.name)}</td><td>${esc(service.prefix)}</td><td>${esc(service.prefix + String(service.nextNumber).padStart(3,'0'))}</td><td>${service.waiting}</td><td><a class="btn btn-secondary" href="retirar.html?setor=${encodeURIComponent(service.id)}" target="_blank" rel="noopener">Gerar senha</a></td></tr>`).join('');
  $('dot').className = 'dot ok'; $('connection').textContent = 'Sistema online';
  $('updated').textContent = 'Atualizado ' + formatDateTime(state.updatedAt);
  $('dayStatus').textContent = `${dateLabel(state.session.date)} • ${state.session.closedAt ? 'Encerrado' : 'Aberto'}`;
  $('stats').innerHTML = state.services.map(service => `<div class="queue-card"><strong>${service.waiting}</strong><span>${esc(service.name)}</span></div>`).join('');
  const selected = $('service').value;
  $('service').replaceChildren(...state.services.map(service => new Option(`${service.name} (${service.waiting})`,service.id)));
  if (state.services.some(service => service.id === selected)) $('service').value = selected;
  $('activeDesks').innerHTML = state.active.length ? state.active.map(ticket => `<div class="queue-item"><div><strong>${esc(ticket.desk)}</strong><div>${esc(ticket.code)} • ${esc(ticket.serviceName)}</div></div>${badge(ticket.status)}</div>`).join('') : '<div class="empty">Nenhum guichê ocupado.</div>';
  $('closeDay').hidden = !!state.session.closedAt;
  $('openDay').hidden = !state.session.closedAt || state.session.date >= today();
  $('reopenDay').hidden = !state.session.closedAt || state.session.date !== today();
  const pending = state.tickets.filter(ticket => ['aguardando','chamada','em_atendimento'].includes(ticket.status)).length;
  $('pendingSummary').textContent = `${pending} senha(s) pendente(s). ${state.session.date < today() && !state.session.closedAt ? 'O dia anterior continua aberto. Resolva as pendências e encerre-o para abrir hoje.' : 'Os registros permanecem disponíveis após o encerramento.'}`;
  const selectedDay = $('historyDay').value;
  const options = [new Option(`${dateLabel(state.session.date)} • Dia atual`, state.session.id),
    ...state.archives.filter(item => item.id !== state.session.id).slice().sort((a,b) => b.date.localeCompare(a.date)).map(item => new Option(`${dateLabel(item.date)} • ${item.count} senha(s)`,item.id))];
  if (state.hasLegacy) options.push(new Option('Registros anteriores à atualização','legacy'));
  $('historyDay').replaceChildren(...options);
  if (options.some(option => option.value === selectedDay)) $('historyDay').value = selectedDay;
  renderDesk();
  if ($('historyDay').value === state.session.id) {
    historyRequest++; historyLoading = null;
    history = {session:state.session,tickets:state.tickets}; renderHistory();
  } else if ((!history || history.session?.id === state.session.id) && !historyLoading) loadHistory();
}
async function refresh() {
  if (!pin || refreshing || busy) return;
  refreshing = true;
  const requestedPin = pin;
  try { const result = await getState(pin,$('agendaDate').value ? {agendaDate:$('agendaDate').value} : {}); if (requestedPin === pin) render(result); }
  catch (error) {
    if (requestedPin !== pin) return;
    $('dot').className = 'dot'; $('connection').textContent = 'Sem conexão — confira antes de agir';
    if (/PIN/.test(error.message)) logout();
  } finally { refreshing = false; }
}
async function act(action, payload = {}) {
  if (busy || !state || !pin) return;
  const requestedPin = pin;
  const body = {sessionId:state.session.id, desk:$('desk').value, ticketId:current()?.id, agendaDate:$('agendaDate').value, ...payload};
  busy = true; controls();
  try {
    const result = await postAction(action,body,pin);
    if (pin === requestedPin) { render(result.state); toast('Operação concluída.'); return result; }
  } catch (error) { if (pin === requestedPin) toast(error.message,true); }
  finally { busy = false; controls(); await refresh(); }
}
function logout() {
  pin = ''; state = null; history = null; historyRequest++; historyLoading = null;
  sessionStorage.removeItem('panelPin'); $('pin').value = '';
  for (const id of ['current','queue','activeDesks','historyRows','stats','sectorRows','appointmentRows']) $(id).replaceChildren();
  resetAppointmentForm();
  controls(); showLogin();
}
$('loginBtn').onclick = async () => {
  $('loginBtn').disabled = true;
  try {
    const entered = $('pin').value;
    await postAction('verify_pin',{},entered);
    pin = entered; sessionStorage.setItem('panelPin',pin); $('pin').value = '';
    $('login').classList.remove('show'); await refresh();
  } catch (error) { toast(error.message,true); }
  finally { $('loginBtn').disabled = false; }
};
$('pin').onkeydown = event => { if (event.key === 'Enter') $('loginBtn').click(); };
$('logout').onclick = logout;
$('desk').oninput = () => { renderDesk(); renderAppointments(); };
$('desk').onchange = () => { try { localStorage.setItem('panelDesk',$('desk').value); } catch {} renderDesk(); };
$('service').onchange = renderDesk;
$('next').onclick = () => act('call_next',{serviceId:$('service').value});
$('callSpecific').onclick = () => act('call_specific',{code:$('specific').value});
for (const action of ['recall','start','finish','absent']) $(action).onclick = () => act(action);
$('cancelCurrent').onclick = () => { if (current() && confirm(`Cancelar ${current().code} neste guichê? O registro será preservado.`)) act('cancel_ticket'); };
$('queue').onclick = event => {
  const button = event.target.closest('[data-cancel]');
  if (button && confirm('Cancelar esta senha? Ela permanecerá no histórico.')) act('cancel_ticket',{ticketId:button.dataset.cancel});
};
$('closeDay').onclick = () => { if (confirm('Encerrar o dia? O histórico será preservado e a emissão ficará fechada. Senhas pendentes impedem o encerramento.')) act('close_day'); };
$('openDay').onclick = () => { if (confirm('Abrir o atendimento de hoje e iniciar a numeração em 001? O histórico anterior será preservado.')) act('open_day'); };
$('reopenDay').onclick = () => { if (confirm('Reabrir o dia de hoje, mantendo a numeração e os registros?')) act('reopen_day'); };
function sectorPreview() {
  const prefix = $('sectorPrefix').value.trim().toUpperCase();
  $('sectorPreview').textContent = /^[A-Z]{1,3}$/.test(prefix)
    ? `Senhas deste setor: ${prefix}001, ${prefix}002, ${prefix}003… O prefixo precisa ser diferente dos setores já cadastrados.`
    : 'Use de 1 a 3 letras exclusivas para identificar as senhas do setor.';
}
$('sectorPrefix').oninput = sectorPreview;
$('sectorForm').onsubmit = async event => {
  event.preventDefault();
  if (!$('sectorForm').reportValidity()) return;
  const result = await act('create_service',{name:$('sectorName').value,prefix:$('sectorPrefix').value});
  if (result?.service) {
    $('sectorName').value = ''; $('sectorPrefix').value = ''; sectorPreview();
    $('service').value = result.service.id; renderDesk();
    toast(`Setor ${result.service.name} cadastrado. Use Gerar senha para emitir ${result.service.prefix}001.`);
  }
};

const appointmentLabels = {agendada:'Agendada',compareceu:'Chegada confirmada',cancelada:'Cancelada',ausente:'Ausente',reagendada:'Reagendada'};
function resetAppointmentForm() {
  editingAppointment = null;
  $('appointmentName').value = ''; $('appointmentTime').value = '';
  $('saveAppointment').textContent = 'Agendar consulta';
  $('cancelAppointmentEdit').hidden = true;
  $('appointmentMessage').textContent = '';
  controls();
}
function renderAppointments() {
  if (!state) return;
  if (state.agendaDate !== $('agendaDate').value) {
    $('appointmentRows').replaceChildren(); $('agendaSummary').textContent = 'Carregando a agenda selecionada...'; return;
  }
  const appointments = (state.appointments || []).filter(item => (!$('agendaStatus').value || item.status === $('agendaStatus').value) && (!$('agendaMine').checked || normalizeDesk(item.createdByDesk) === normalizeDesk($('desk').value))).slice().sort((a,b) => a.time.localeCompare(b.time) || a.patientName.localeCompare(b.patientName));
  const button = (item,action,label) => `<button class="btn btn-secondary" type="button" data-appointment-id="${esc(item.id)}" data-appointment-action="${action}">${label}</button>`;
  $('agendaSummary').textContent = `${appointments.length} consulta(s) para ${dateLabel(state.agendaDate)}. Horários de Brasília.`;
  $('appointmentRows').innerHTML = appointments.map(item => {
    const actions = item.status === 'agendada' ? button(item,'edit','Reagendar') + button(item,'cancel_appointment','Cancelar') +
      (item.date === state.today ? button(item,'appointment_checkin','Confirmar chegada') : '') +
      (item.date <= state.today ? button(item,'appointment_absent','Marcar ausente') : '') :
      item.ticketSnapshot ? button(item,'print','Imprimir senha') : '—';
    return `<tr><td><strong>${esc(item.time)}</strong> • ${item.duration} min<br>${esc(item.patientName)}</td><td>${esc(item.serviceName)}<br>${esc(item.room)}</td><td>${esc(item.createdByDesk)}<details><summary>Alterações</summary>${item.events.map(event => `<p>${esc(formatDateTime(event.at))} • ${esc(appointmentLabels[event.action] || event.action)} • ${esc(event.desk)}${event.date ? `<br>${esc(dateLabel(event.date))} ${esc(event.time)} • ${esc(event.room)} • ${esc(event.serviceName || '')}` : ''}</p>`).join('')}</details></td><td>${esc(appointmentLabels[item.status])}${item.ticketSnapshot ? `<br><strong>Senha ${esc(item.ticketSnapshot.code)}</strong>` : ''}</td><td><div class="actions">${actions}</div></td></tr>`;
  }).join('') || '<tr><td colspan="5">Nenhuma consulta nesta seleção.</td></tr>';
  controls();
}
$('appointmentForm').onsubmit = async event => {
  event.preventDefault();
  if (!$('appointmentForm').reportValidity() || busy) return;
  const payload = {patientName:$('appointmentName').value,serviceId:$('appointmentService').value,room:$('appointmentRoom').value,date:$('appointmentDate').value,time:$('appointmentTime').value,duration:Number($('appointmentDuration').value),
    ...(editingAppointment ? {appointmentId:editingAppointment.id,expectedVersion:editingAppointment.version} : {})};
  const result = await act(editingAppointment ? 'reschedule_appointment' : 'create_appointment',payload);
  if (result?.appointment) {
    resetAppointmentForm();
    $('appointmentMessage').textContent = `Consulta de ${result.appointment.patientName} agendada para ${dateLabel(result.appointment.date)} às ${result.appointment.time}, em ${result.appointment.room}.`;
    $('agendaDate').value = result.appointment.date; $('agendaStatus').value = '';
    renderAppointments(); await refresh();
  }
};
$('cancelAppointmentEdit').onclick = resetAppointmentForm;
$('agendaDate').onchange = () => { if (!$('agendaDate').value) $('agendaDate').value = state?.today || today(); renderAppointments(); refresh(); };
$('agendaStatus').onchange = renderAppointments;
$('agendaMine').onchange = renderAppointments;
$('refreshAgenda').onclick = refresh;
$('appointmentRows').onclick = async event => {
  const button = event.target.closest('[data-appointment-action]');
  if (!button || button.disabled || busy) return;
  const item = state?.appointments?.find(item => item.id === button.dataset.appointmentId);
  if (!item) return;
  const action = button.dataset.appointmentAction;
  if (action === 'edit') {
    editingAppointment = {id:item.id,version:item.version};
    $('appointmentName').value = item.patientName; $('appointmentService').value = item.serviceId;
    $('appointmentRoom').value = item.room; $('appointmentDate').value = item.date;
    $('appointmentTime').value = item.time; $('appointmentDuration').value = item.duration;
    $('saveAppointment').textContent = 'Salvar reagendamento'; $('cancelAppointmentEdit').hidden = false;
    $('appointmentMessage').textContent = 'Ajuste o setor, a sala, a data ou o horário e salve. O histórico da alteração será preservado.';
    controls(); $('appointmentDate').focus(); return;
  }
  if (action === 'print') {
    try { await printTicket(item.ticketSnapshot); }
    catch (error) { toast('A senha já existe. ' + error.message,true); }
    return;
  }
  const question = {cancel_appointment:'Cancelar esta consulta? O cadastro continuará no histórico.',appointment_absent:'Marcar que a pessoa não compareceu?',appointment_checkin:'Confirmar a chegada e gerar a senha na fila do setor?'}[action];
  if (!question || !confirm(question)) return;
  const result = await act(action,{appointmentId:item.id,expectedVersion:item.version});
  if (result?.ticket) {
    $('appointmentMessage').textContent = `Chegada confirmada: ${result.ticket.patientName}, senha ${result.ticket.code}. Use Imprimir senha na agenda se precisar de uma segunda via.`;
    if (getPrinterSettings().auto && !result.alreadyCheckedIn) {
      try { await printTicket(result.ticket); }
      catch (error) { toast(`Senha ${result.ticket.code} já gerada. ${error.message} Use Imprimir senha para tentar novamente.`,true); }
    }
  }
};

function selectedTickets() {
  const filter = $('historyStatus').value;
  return (history?.tickets || []).filter(ticket => !filter || ticket.status === filter).slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
}
function renderHistory() {
  const expanded = new Set([...document.querySelectorAll('details[open][data-ticket]')].map(element => element.dataset.ticket));
  $('historyStatus').disabled = !!history?.legacy;
  if (history?.legacy) {
    $('historySummary').textContent = 'Registros preservados da versão anterior. Ela não registrava início e conclusão do atendimento.';
    $('historyRows').innerHTML = history.events.map(event => `<tr><td>${esc(event.code)}<br>${esc(event.patientName)}</td><td>${esc(event.serviceName)}<br>${esc(event.desk)}</td><td>${esc(event.status)}</td><td>${esc(formatDateTime(event.calledAt))}</td><td>—</td></tr>`).join('');
  } else {
    const tickets = selectedTickets();
    $('historySummary').textContent = `${tickets.length} senha(s) na seleção. Abra as etapas para ver as mudanças de situação.`;
    $('historyRows').innerHTML = tickets.map(ticket => `<tr><td><strong>${esc(ticket.code)}</strong><br>${esc(ticket.patientName)}</td><td>${esc(ticket.serviceName)}<br>${esc(ticket.desk || '—')}</td><td>${badge(ticket.status)}</td><td><div>Emissão: ${esc(formatDateTime(ticket.createdAt))}</div>${ticket.startedAt ? `<div>Início: ${esc(formatDateTime(ticket.startedAt))}</div>` : ''}${ticket.finishedAt ? `<div>Fim: ${esc(formatDateTime(ticket.finishedAt))}</div>` : ''}<details data-ticket="${esc(ticket.id)}"${expanded.has(ticket.id) ? ' open' : ''}><summary>Ver etapas</summary>${ticket.events.map(event => `<p>${esc(formatDateTime(event.at))} • ${esc(statusLabels[event.status] || event.status)}${event.note ? ` — ${esc(event.note)}` : ''}</p>`).join('')}</details></td><td>${ticket.status === 'ausente' && history.session?.id === state?.session.id && !state.session.closedAt ? `<button class="btn btn-secondary" data-return="${esc(ticket.id)}">Retornar à fila</button>` : '—'}</td></tr>`).join('') || '<tr><td colspan="5">Nenhum registro nesta seleção.</td></tr>';
  }
  $('csv').disabled = !history; controls();
}
async function loadHistory() {
  if (!state || !pin) return;
  const id = $('historyDay').value, request = ++historyRequest;
  historyLoading = id;
  history = null; $('csv').disabled = true; $('historyRows').replaceChildren();
  $('historySummary').textContent = 'Carregando histórico...';
  try {
    const result = await getHistory(id,pin);
    if (request !== historyRequest) return;
    history = result; renderHistory();
  } catch (error) { if (request === historyRequest) $('historySummary').textContent = error.message; }
  finally { if (request === historyRequest) historyLoading = null; }
}
$('historyDay').onchange = loadHistory;
$('historyStatus').onchange = renderHistory;
$('refreshHistory').onclick = loadHistory;
$('historyRows').onclick = event => {
  const button = event.target.closest('[data-return]');
  if (button && confirm('Retornar esta senha ao final da fila?')) act('return_queue',{ticketId:button.dataset.return});
};
$('csv').onclick = () => {
  if (!history) return;
  const rows = history.legacy ? [['Senha','Nome','Setor','Guichê','Chamada','Registro anterior'],...history.events.map(event => [event.code,event.patientName,event.serviceName,event.desk,formatDateTime(event.calledAt),event.status])] :
    [['ID','Dia','Senha','Nome','Setor','Guichê','Situação','Emissão','Primeira chamada','Início','Fim','Etapas'], ...selectedTickets().map(ticket => [ticket.id,ticket.businessDate,ticket.code,ticket.patientName,ticket.serviceName,ticket.desk,statusLabels[ticket.status],formatDateTime(ticket.createdAt),formatDateTime(ticket.firstCalledAt),formatDateTime(ticket.startedAt),formatDateTime(ticket.finishedAt),ticket.events.map(event => `${formatDateTime(event.at)} ${statusLabels[event.status] || event.status}`).join(' | ')])];
  const csv = '\uFEFF' + rows.map(row => row.map(value => {
    let text = String(value ?? ''); if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"','""') + '"';
  }).join(';')).join('\n');
  const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = `historico-${history.session?.date || 'anterior'}.csv`;
  link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
};
controls();
if (pin) refresh(); else showLogin();
setInterval(refresh,2500);
