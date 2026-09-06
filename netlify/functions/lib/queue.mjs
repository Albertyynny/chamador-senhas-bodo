export const ACTIVE = ['chamada', 'em_atendimento'];
export const PENDING = ['aguardando', ...ACTIVE];
export const businessDate = (now = new Date().toISOString()) => new Intl.DateTimeFormat('en-CA', {
  timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit'
}).format(new Date(now));
export const cleanText = (value, max = 80) => String(value || '').replace(/[\u0000-\u001F\u007F<>"'&]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
export const deskKey = value => cleanText(value, 30).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const definitions = [
  ['odontologico','Odontológico','O'], ['consultorio-medico','Consultório Médico','M'],
  ['nutricionista','Nutricionista','N'], ['fisioterapia','Fisioterapia','F'],
  ['exames-laboratoriais','Exames Laboratoriais','L'], ['enfermaria','Enfermaria','E']
];
export function defaultState(now = new Date().toISOString()) {
  return {version:2, revision:0, updatedAt:now,
    session:{id:crypto.randomUUID(), date:businessDate(now), openedAt:now, closedAt:null},
    services:definitions.map(([id,name,prefix]) => ({id,name,prefix,nextNumber:1})),
    tickets:[], calls:[], callSeq:0, archives:[], legacyHistory:[], appointments:[],
    auth:{adminPin:null,servicePins:{}}};
}
export function migrateState(old, now = new Date().toISOString()) {
  if (old.version === 2) { old.appointments ||= []; old.auth ||= {adminPin:null,servicePins:{}}; old.auth.servicePins ||= {}; return old; }
  const state = defaultState(now);
  state.session.id = `migrated-${old.updatedAt || 'initial'}`;
  state.updatedAt = old.updatedAt || now;
  state.services = old.services.map(({queue, ...service}) => service);
  state.legacyHistory = structuredClone(old.history || []);
  const convert = (ticket, status) => ({...ticket,
    id:`${state.session.id}:${ticket.code}:${ticket.createdAt}`,
    sessionId:state.session.id, businessDate:state.session.date, status,
    events:[{status, at:ticket.calledAt || ticket.createdAt, note:'Situação importada da versão anterior'}]
  });
  state.tickets = old.services.flatMap(service => service.queue.map(ticket => convert(ticket, 'aguardando')));
  if (old.current) state.tickets.push({...convert(old.current, 'chamada'),
    desk:cleanText(old.current.desk, 30) || 'Atendimento',
    deskId:deskKey(old.current.desk || 'Atendimento')});
  return state;
}
export const activeTickets = state => state.tickets.filter(ticket => ACTIVE.includes(ticket.status));
const displayTicket = ({id,code,patientName,serviceName,desk,deskId,status,calledAt}) => ({id,code,patientName,serviceName,desk,deskId,status,calledAt});
export function publicState(state, query = new URLSearchParams()) {
  const after = query.has('after') ? Math.max(0, Number(query.get('after')) || 0) : state.callSeq;
  const reset = query.get('session') !== state.session.id || after > state.callSeq;
  const announcements = reset ? [] : state.calls.filter(call => call.seq > after).slice(0,100);
  const active = activeTickets(state).map(displayTicket);
  return {updatedAt:state.updatedAt, revision:state.revision, session:state.session, today:businessDate(),
    current:active.slice().sort((a,b) => b.calledAt.localeCompare(a.calledAt))[0] || null,
    active, lastCalls:state.calls.slice(-6).reverse(), announcements,
    cursor:reset ? state.callSeq : announcements.at(-1)?.seq ?? after,
    reset, callSeq:state.callSeq,
    services:state.services.map(service => ({...service, waiting:state.tickets.filter(ticket => ticket.serviceId === service.id && ticket.status === 'aguardando').length}))};
}
export function adminState(state, agendaDate = businessDate()) {
  return {...publicState(state), tickets:state.tickets,
    agendaDate, appointments:(state.appointments || []).filter(item => item.date === agendaDate),
    archives:state.archives.map(({key,...archive}) => archive), hasLegacy:state.legacyHistory.length > 0,
    services:state.services.map(service => ({...service,
      waiting:state.tickets.filter(t => t.serviceId === service.id && t.status === 'aguardando').length,
      pinConfigured:!!state.auth?.servicePins?.[service.id]}))};
}
export function serviceState(state, serviceId) {
  const service = state.services.find(item => item.id === serviceId);
  if (!service) throw new Error('Setor não encontrado.');
  const visibleTickets = state.tickets.filter(ticket => ticket.serviceId === serviceId);
  return {...publicState(state), services:[{...service,waiting:visibleTickets.filter(ticket => ticket.status === 'aguardando').length}],
    tickets:visibleTickets, active:activeTickets(state).filter(ticket => ticket.serviceId === serviceId),
    agendaDate:state.session.date, appointments:[], archives:[], hasLegacy:false};
}
function change(ticket, status, now, note = '') {
  ticket.status = status;
  ticket.events.push({status, at:now, desk:ticket.desk || '', note});
}
function requireSession(state, body) {
  if (body.sessionId !== state.session.id) throw new Error('O dia de atendimento mudou. Atualize a página antes de continuar.');
}
function requireOpen(state) {
  if (state.session.closedAt) throw new Error('Dia encerrado. Aguarde a abertura do atendimento pela recepção.');
}
function targetAtDesk(state, body) {
  const ticket = activeTickets(state).find(ticket => ticket.deskId === deskKey(body.desk));
  if (!ticket || !body.ticketId || ticket.id !== body.ticketId) throw new Error('A senha deste guichê mudou. Confira o painel e tente novamente.');
  return ticket;
}
function recordCall(state, ticket, now, recalled = false) {
  ticket.calledAt = now;
  ticket.firstCalledAt ||= now;
  const seq = ++state.callSeq;
  const call = {ticketId:ticket.id, code:ticket.code, patientName:ticket.patientName,
    serviceName:ticket.serviceName, desk:ticket.desk, deskId:ticket.deskId,
    calledAt:now, callId:`${state.session.id}:${seq}`, seq, recalled};
  state.calls.push(call);
  return call;
}
export function applyAction(state, body, now = new Date().toISOString()) {
  const action = body.action;
  const auth = body.auth;
  const isAdmin = !auth || auth.role === 'admin';
  const serviceAllowed = serviceId => !auth || isAdmin || auth.serviceId === serviceId;
  if (auth && !isAdmin && ['create_service','open_day','reopen_day','close_day','create_appointment','reschedule_appointment','cancel_appointment','appointment_absent','appointment_checkin'].includes(action)) {
    throw new Error('Somente o administrador geral tem acesso a esta função.');
  }
  if (['create_appointment','reschedule_appointment','cancel_appointment','appointment_absent','appointment_checkin'].includes(action)) {
    requireSession(state,body);
    return appointmentAction(state,body,now);
  }
  if (action === 'reset') throw new Error('Atualize o painel: use Encerrar dia para preservar o histórico.');
  if (action === 'open_day') {
    requireSession(state, body);
    if (!state.session.closedAt) throw new Error('Encerre o dia atual antes de iniciar outro.');
    const today = businessDate(now);
    if (today <= state.session.date) throw new Error('Um novo dia só pode ser aberto na próxima data. Para continuar hoje, use Reabrir dia.');
    state.session = {id:crypto.randomUUID(), date:today, openedAt:now, closedAt:null};
    state.tickets = []; state.calls = []; state.callSeq = 0;
    state.services.forEach(service => { service.nextNumber = 1; });
    return {};
  }
  requireSession(state, body);
  if (action === 'create_service') {
    const name = cleanText(body.name,81);
    const prefix = String(body.prefix || '').trim().toUpperCase();
    if (name.length < 2 || name.length > 80) throw new Error('Informe um nome de setor entre 2 e 80 caracteres.');
    if (!/^[A-Z]{1,3}$/.test(prefix)) throw new Error('O prefixo deve ter de 1 a 3 letras, sem números ou acentos.');
    const nameKey = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if (state.services.some(service => nameKey(service.name) === nameKey(name))) throw new Error('Já existe um setor com esse nome.');
    if (state.services.some(service => service.prefix.toUpperCase() === prefix)) throw new Error('Este prefixo já pertence a outro setor. Escolha outras letras.');
    const service = {id:`setor-${crypto.randomUUID()}`,name,prefix,nextNumber:1};
    state.services.push(service);
    return {service};
  }
  if (action === 'set_service_pin') {
    if (auth && !isAdmin) throw new Error('Somente o administrador geral pode cadastrar PINs de setor.');
    const service = state.services.find(item => item.id === body.serviceId);
    const pin = String(body.pin || '');
    if (!service) throw new Error('Setor não encontrado.');
    if (!/^\d{4,12}$/.test(pin)) throw new Error('O PIN do setor deve ter de 4 a 12 dígitos.');
    state.auth ||= {adminPin:null,servicePins:{}}; state.auth.servicePins ||= {};
    if (pin === state.auth.adminPin || Object.entries(state.auth.servicePins).some(([id,value]) => id !== service.id && value === pin)) throw new Error('Este PIN já está em uso.');
    state.auth.servicePins[service.id] = pin;
    return {serviceId:service.id};
  }
  if (action === 'reopen_day') {
    if (!state.session.closedAt || state.session.date !== businessDate(now)) throw new Error('Só é possível reabrir o atendimento encerrado de hoje.');
    state.session.closedAt = null;
    return {};
  }
  requireOpen(state);
  if (action === 'close_day') {
    if (state.tickets.some(ticket => PENDING.includes(ticket.status))) throw new Error('Há senhas aguardando ou em atendimento. Conclua, marque ausente ou cancele essas senhas antes de encerrar.');
    state.session.closedAt = now;
    return {archive:true};
  }
  if (action === 'take') {
    if (state.session.date !== businessDate(now)) throw new Error('A recepção precisa encerrar o dia anterior e abrir o atendimento de hoje.');
    const service = state.services.find(service => service.id === body.serviceId);
    if (!service) throw new Error('Tipo de atendimento inválido.');
    const ticket = {id:crypto.randomUUID(), sessionId:state.session.id, businessDate:state.session.date,
      code:`${service.prefix}${String(service.nextNumber++).padStart(3,'0')}`,
      serviceId:service.id, serviceName:service.name, patientName:cleanText(body.patientName),
      createdAt:now, status:'aguardando', events:[{status:'aguardando',at:now}]};
    state.tickets.push(ticket);
    return {ticket};
  }
  if (action === 'call_next' || action === 'call_specific') {
    if (!serviceAllowed(body.serviceId)) throw new Error('Seu acesso está limitado ao setor cadastrado.');
    const desk = cleanText(body.desk,30);
    if (!desk) throw new Error('Informe o local deste atendimento.');
    if (activeTickets(state).some(ticket => ticket.deskId === deskKey(desk))) throw new Error('Este local já tem uma senha. Conclua ou marque a situação antes de chamar outra.');
    const ticket = state.tickets.find(ticket => ticket.status === 'aguardando' && (action === 'call_next'
      ? ticket.serviceId === body.serviceId : ticket.code === cleanText(body.code).toUpperCase()));
    if (!ticket) throw new Error('Nenhuma senha encontrada na fila selecionada.');
    if (!serviceAllowed(ticket.serviceId)) throw new Error('Seu acesso está limitado ao setor cadastrado.');
    ticket.desk = desk; ticket.deskId = deskKey(desk);
    change(ticket,'chamada',now);
    return {call:recordCall(state,ticket,now)};
  }
  if (action === 'cancel_ticket' || action === 'remove_ticket') {
    const ticket = state.tickets.find(ticket => ticket.id === body.ticketId);
    if (!ticket || !PENDING.includes(ticket.status)) throw new Error('Esta senha não está mais pendente.');
    if (!serviceAllowed(ticket.serviceId)) throw new Error('Seu acesso está limitado ao setor cadastrado.');
    if (ACTIVE.includes(ticket.status)) targetAtDesk(state, body);
    change(ticket,'cancelada',now,cleanText(body.reason) || 'Cancelada pelo atendente');
    ticket.finishedAt = now;
    return {ticket};
  }
  if (action === 'return_queue') {
    const ticket = state.tickets.find(ticket => ticket.id === body.ticketId);
    if (!ticket || ticket.status !== 'ausente') throw new Error('Só uma senha ausente pode retornar à fila.');
    if (!serviceAllowed(ticket.serviceId)) throw new Error('Seu acesso está limitado ao setor cadastrado.');
    change(ticket,'aguardando',now,'Retorno à fila');
    delete ticket.finishedAt; delete ticket.startedAt; delete ticket.desk; delete ticket.deskId;
    state.tickets = [...state.tickets.filter(item => item.id !== ticket.id),ticket];
    return {ticket};
  }
  if (!['recall','start','finish','absent'].includes(action)) throw new Error('Ação inválida.');
  const ticket = targetAtDesk(state,body);
  if (!serviceAllowed(ticket.serviceId)) throw new Error('Seu acesso está limitado ao setor cadastrado.');
  if (action === 'recall') {
    if (ticket.status !== 'chamada') throw new Error('A senha já está em atendimento.');
    ticket.events.push({status:'rechamada',at:now,desk:ticket.desk});
    return {call:recordCall(state,ticket,now,true)};
  }
  if (action === 'start' || action === 'absent') {
    if (ticket.status !== 'chamada') throw new Error('Esta ação exige uma senha chamada, ainda sem atendimento iniciado.');
    change(ticket, action === 'start' ? 'em_atendimento' : 'ausente', now);
    if (action === 'start') ticket.startedAt = now; else ticket.finishedAt = now;
  } else {
    if (ticket.status !== 'em_atendimento') throw new Error('Inicie o atendimento antes de concluir.');
    change(ticket,'concluida',now); ticket.finishedAt = now;
  }
  return {ticket};
}

const appointmentMinutes = time => Number(time.slice(0,2)) * 60 + Number(time.slice(3));
const localTime = now => new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(now));
function appointmentSlot(state,body,now,excludeId) {
  const service = state.services.find(item => item.id === body.serviceId);
  if (!service) throw new Error('Selecione um setor cadastrado.');
  const room = cleanText(body.room,31);
  if (room.length < 2 || room.length > 30) throw new Error('Informe a sala ou guichê da consulta, entre 2 e 30 caracteres.');
  const date = String(body.date || ''), time = String(body.time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date + 'T12:00:00Z')) || new Date(date + 'T12:00:00Z').toISOString().slice(0,10) !== date) throw new Error('Informe uma data válida.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Informe um horário válido.');
  if (date < businessDate(now) || (date === businessDate(now) && time < localTime(now))) throw new Error('Escolha uma data e um horário que ainda não passaram.');
  const duration = Number(body.duration);
  if (![15,20,30,45,60].includes(duration)) throw new Error('Escolha uma duração de 15, 20, 30, 45 ou 60 minutos.');
  const start = appointmentMinutes(time), end = start + duration;
  if (end > 1440) throw new Error('A consulta deve terminar no mesmo dia.');
  const roomId = deskKey(room);
  if (state.appointments.some(item => item.id !== excludeId && item.date === date && item.roomId === roomId && ['agendada','compareceu'].includes(item.status) && start < appointmentMinutes(item.time) + item.duration && end > appointmentMinutes(item.time))) throw new Error('Já existe uma consulta nessa sala durante esse intervalo. Escolha outro horário ou sala.');
  return {serviceId:service.id,serviceName:service.name,room,roomId,date,time,duration};
}
function appointmentAction(state,body,now) {
  state.appointments ||= [];
  const desk = cleanText(body.desk,30);
  if (!desk) throw new Error('Informe o guichê responsável pelo cadastro no início do painel.');
  if (body.action === 'create_appointment') {
    const patientName = cleanText(body.patientName,81);
    if (patientName.length < 2 || patientName.length > 80) throw new Error('Informe o nome da pessoa, entre 2 e 80 caracteres.');
    const slot = appointmentSlot(state,body,now);
    const appointment = {id:crypto.randomUUID(),...slot,patientName,status:'agendada',version:1,
      createdAt:now,updatedAt:now,createdByDesk:desk,updatedByDesk:desk,
      events:[{action:'agendada',at:now,desk,...slot}]};
    state.appointments.push(appointment);
    return {appointment};
  }
  const appointment = state.appointments.find(item => item.id === body.appointmentId);
  if (!appointment) throw new Error('Agendamento não encontrado. Atualize a agenda.');
  if (body.action === 'appointment_checkin') {
    requireOpen(state);
    if (appointment.date !== businessDate(now) || state.session.date !== businessDate(now)) throw new Error('A chegada só pode ser confirmada na data da consulta, com o atendimento de hoje aberto.');
    if (appointment.status === 'compareceu') return {appointment,ticket:appointment.ticketSnapshot,alreadyCheckedIn:true};
  }
  if (body.expectedVersion !== appointment.version) throw new Error('Este agendamento foi alterado por outro guichê. Atualize a agenda antes de continuar.');
  if (appointment.status !== 'agendada') throw new Error('Só é possível alterar consultas que ainda estão agendadas. Após a chegada, use a fila de atendimento.');
  let ticket;
  if (body.action === 'reschedule_appointment') {
    Object.assign(appointment,appointmentSlot(state,body,now,appointment.id));
  } else if (body.action === 'appointment_checkin') {
    ({ticket} = applyAction(state,{action:'take',sessionId:state.session.id,serviceId:appointment.serviceId,patientName:appointment.patientName},now));
    ticket.appointmentId = appointment.id;
    appointment.status = 'compareceu'; appointment.checkedInAt = now;
    appointment.ticketSnapshot = structuredClone(ticket);
  } else if (body.action === 'appointment_absent') {
    if (appointment.date > businessDate(now) || (appointment.date === businessDate(now) && appointment.time > localTime(now))) throw new Error('Aguarde o horário agendado antes de marcar ausência.');
    appointment.status = 'ausente';
  } else {
    appointment.status = 'cancelada';
  }
  appointment.updatedAt = now; appointment.updatedByDesk = desk; appointment.version++;
  appointment.events.push({action:body.action === 'reschedule_appointment' ? 'reagendada' : appointment.status,at:now,desk,date:appointment.date,time:appointment.time,room:appointment.room,serviceName:appointment.serviceName,duration:appointment.duration});
  return {appointment,...(ticket ? {ticket} : {})};
}
