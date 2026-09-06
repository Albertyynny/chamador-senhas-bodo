import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const moduleURL = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const domainURL = moduleURL(fs.readFileSync('netlify/functions/lib/queue.mjs','utf8'));
const {defaultState,migrateState,applyAction,publicState,adminState,businessDate,activeTickets} = await import(domainURL);
const apiSource = fs.readFileSync('netlify/functions/api.mjs','utf8')
  .replace("import { getStore } from '@netlify/blobs';",'const getStore = () => {};')
  .replace("'./lib/queue.mjs'",JSON.stringify(domainURL));
const {mutate,handle} = await import(moduleURL(apiSource));
const {AnnouncementQueue} = await import(moduleURL(fs.readFileSync('public/announcement-queue.js','utf8')));
const time = '2026-09-06T12:00:00.000Z';
const nextDay = '2026-09-07T12:00:00.000Z';
const state = defaultState(time);
const action = (action,payload = {},now = time) => applyAction(state,{action,sessionId:state.session.id,...payload},now);
assert.equal(businessDate('2026-09-07T02:59:00Z'),'2026-09-06');
assert.equal(businessDate('2026-09-07T03:00:00Z'),'2026-09-07');
const a = action('take',{serviceId:'consultorio-medico',patientName:'Ana'}).ticket;
const b = action('take',{serviceId:'odontologico'}).ticket;
action('call_next',{serviceId:a.serviceId,desk:'Guichê 01'});
action('call_next',{serviceId:b.serviceId,desk:'Guichê 02'});
assert.equal(activeTickets(state).length,2);
assert.throws(() => action('call_next',{serviceId:b.serviceId,desk:'guiche 01'}),/já tem uma senha/);
assert.throws(() => action('finish',{desk:'Guichê 02',ticketId:a.id}),/mudou/);
assert.throws(() => action('finish',{desk:'Guichê 01',ticketId:a.id}),/Inicie/);
action('start',{desk:'Guichê 01',ticketId:a.id},'2026-09-06T12:05:00Z');
action('finish',{desk:'Guichê 01',ticketId:a.id},'2026-09-06T12:15:00Z');
assert.equal(a.status,'concluida');
assert.deepEqual(a.events.map(event => event.status),['aguardando','chamada','em_atendimento','concluida']);
assert.equal(activeTickets(state)[0].id,b.id);
action('recall',{desk:'Guichê 02',ticketId:b.id});
let response = publicState(state,new URLSearchParams({session:state.session.id,after:'0'}));
assert.deepEqual(response.announcements.map(call => call.seq),[1,2,3]);
assert.equal(response.announcements[2].recalled,true);
assert.ok(!('events' in response.active[0]));
action('absent',{desk:'Guichê 02',ticketId:b.id});
action('return_queue',{ticketId:b.id});
assert.equal(b.status,'aguardando');
assert.throws(() => action('close_day'),/pendentes|aguardando/);
action('cancel_ticket',{ticketId:b.id});
action('close_day');
assert.throws(() => action('take',{serviceId:a.serviceId}),/encerrado/);
action('reopen_day');
assert.equal(state.services.find(service => service.id === a.serviceId).nextNumber,2);
action('close_day');
assert.throws(() => action('open_day'),/próxima data/);
const oldId = state.session.id;
action('open_day',{},nextDay);
assert.notEqual(state.session.id,oldId);
assert.equal(state.tickets.length,0);
assert.equal(state.services[0].nextNumber,1);
assert.throws(() => applyAction(state,{action:'call_next',sessionId:oldId}),/mudou/);
assert.throws(() => action('reset'),/preservar/);

const legacy = {version:1,updatedAt:time,services:[{id:'m',name:'Médico',prefix:'M',nextNumber:8,queue:[{code:'M007',serviceId:'m',createdAt:time}]}],
  current:{code:'M006',serviceId:'m',createdAt:time,calledAt:time,desk:'Sala 1'},history:[{code:'M005',status:'chamada',calledAt:time}]};
const migrated = migrateState(legacy,time);
assert.equal(migrated.tickets.length,2);
assert.equal(migrated.tickets[0].status,'aguardando');
assert.equal(migrated.tickets[1].status,'chamada');
assert.deepEqual(migrated.legacyHistory,legacy.history);
assert.equal(migrated.services[0].nextNumber,8);
assert.equal(migrateState(legacy,time).tickets[0].id,migrated.tickets[0].id);

class Store {
  constructor(initial) { this.values = new Map([['estado',structuredClone(initial)]]); this.etag = 1; }
  async getWithMetadata(key) { return {data:JSON.stringify(this.values.get(key)),etag:String(this.etag)}; }
  async get(key) { return structuredClone(this.values.get(key)); }
  async setJSON(key,value,options = {}) {
    if (key.startsWith('history/') && this.failArchive) throw new Error('Archive storage offline');
    if (key === 'estado' && options.onlyIfMatch !== String(this.etag)) return {modified:false};
    if (options.onlyIfNew && this.values.has(key)) return {modified:false};
    this.values.set(key,structuredClone(value));
    if (key === 'estado') this.etag++;
    return {modified:true};
  }
}
const live = defaultState();
const store = new Store(live);
const run = (action,payload = {}) => mutate(store,{action,sessionId:live.session.id,...payload});
await Promise.all([run('take',{serviceId:'consultorio-medico'}),run('take',{serviceId:'consultorio-medico'})]);
assert.deepEqual((await store.get('estado')).tickets.map(ticket => ticket.code),['M001','M002']);
await Promise.all([run('call_next',{serviceId:'consultorio-medico',desk:'Sala 1'}),run('call_next',{serviceId:'consultorio-medico',desk:'Sala 2'})]);
let snapshot = await store.get('estado');
assert.equal(activeTickets(snapshot).length,2);
assert.equal(new Set(snapshot.calls.map(call => call.seq)).size,2);
for (const ticket of snapshot.tickets) await run('absent',{desk:ticket.desk,ticketId:ticket.id});
store.failArchive = true;
await assert.rejects(run('close_day'),/Archive storage offline/);
assert.equal((await store.get('estado')).session.closedAt,null);
store.failArchive = false;
await run('close_day');
snapshot = await store.get('estado');
assert.equal(snapshot.archives.length,1);
const saved = await store.get(snapshot.archives[0].key);
assert.equal(saved.tickets.length,2);
assert.ok(saved.tickets.every(ticket => ticket.status === 'ausente'));
// Move to tomorrow in the domain and persist, then retrieve the older snapshot via API.
applyAction(snapshot,{action:'open_day',sessionId:snapshot.session.id},new Date(Date.now()+86400000).toISOString());
store.values.set('estado',structuredClone(snapshot)); store.etag++;
const pin = process.env.PAINEL_PIN || '2468';
const url = `https://example.test/api/state?history=${encodeURIComponent(live.session.id)}`;
assert.equal((await handle(new Request(url),store)).status,401);
const historyResponse = await handle(new Request(url,{headers:{'x-panel-pin':pin}}),store);
assert.equal(historyResponse.status,200);
assert.equal((await historyResponse.json()).tickets.length,2);
assert.equal((await store.get('estado')).tickets.length,0);

const crowded = defaultState();
const crowdedStore = new Store(crowded);
for (let i = 0; i < 2; i++) await mutate(crowdedStore,{action:'take',sessionId:crowded.session.id,serviceId:'enfermaria'});
const simultaneous = await Promise.allSettled([1,2].map(() => mutate(crowdedStore,{action:'call_next',sessionId:crowded.session.id,serviceId:'enfermaria',desk:'Sala única'})));
assert.equal(simultaneous.filter(result => result.status === 'fulfilled').length,1);
assert.equal((await crowdedStore.get('estado')).tickets.filter(ticket => ticket.status === 'aguardando').length,1);

// Events are paged, never truncated to just the last visible calls.
const eventsState = await crowdedStore.get('estado');
for (let i = 0; i < 125; i++) applyAction(eventsState,{action:'recall',sessionId:eventsState.session.id,desk:'Sala única',ticketId:eventsState.tickets[0].id});
const page1 = publicState(eventsState,new URLSearchParams({session:eventsState.session.id,after:'0'}));
const page2 = publicState(eventsState,new URLSearchParams({session:eventsState.session.id,after:String(page1.cursor)}));
assert.equal(page1.announcements.length,100);
assert.equal(page2.announcements.length,26);
assert.equal(page2.cursor,126);

const played = [], releases = [];
let idle;
const done = new Promise(resolve => { idle = resolve; });
const queue = new AnnouncementQueue(call => { played.push(call.seq); return new Promise(resolve => releases.push(resolve)); },assert.fail,idle);
queue.enqueue([{seq:1},{seq:2}]);
queue.enqueue([{seq:2},{seq:3}]);
assert.deepEqual(played,[1]);
releases.shift()(); await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(played,[1,2]);
releases.shift()(); await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(played,[1,2,3]);
releases.shift()(); await done;
assert.equal(queue.cursor,3);
queue.reset(10); queue.enqueue([{seq:9}]);
assert.deepEqual(played,[1,2,3]);

// Drive the actual panel handlers through a complete desk-specific workflow.
const helpers = await import(moduleURL(fs.readFileSync('public/app.js','utf8')));
const uiState = defaultState();
const uiAction = (action,payload = {}) => { const result = applyAction(uiState,{action,sessionId:uiState.session.id,...payload}); uiState.revision++; return result; };
const uiA = uiAction('take',{serviceId:'enfermaria'}).ticket;
const uiB = uiAction('take',{serviceId:'enfermaria'}).ticket;
const elements = new Map();
const element = id => {
  if (!elements.has(id)) elements.set(id,{value:'',innerHTML:'',hidden:false,disabled:false,textContent:'',
    classList:{add() {},remove() {}},focus() {},reportValidity:() => true,
    replaceChildren(...children) { this.children = children; if (children[0]?.value !== undefined) this.value = children[0].value; }
  });
  return elements.get(id);
};
const uiMessages = [];
const printedAppointments = [];
const panelContext = vm.createContext({
  ...helpers,
  esc:helpers.escapeHtml,
  document:{getElementById:element,querySelectorAll:() => []},
  sessionStorage:{getItem:() => pin,setItem() {},removeItem() {}},
  localStorage:{getItem:() => '',setItem() {}},
  Option:class { constructor(text,value) { this.text = text; this.value = value; } },
  setInterval() {},setTimeout,Intl,Date,URL,Blob,
  confirm:() => true,toast:message => uiMessages.push(message),
  getState:async (_pin,cursor = {}) => adminState(uiState,cursor.agendaDate),
  postAction:async (action,body) => ({...uiAction(action,body),state:adminState(uiState,body.agendaDate)}),
  getPrinterSettings:() => ({auto:true}),
  printTicket:async ticket => { printedAppointments.push(ticket); throw new Error('Impressora indisponível'); },
  getHistory:async () => ({session:uiState.session,tickets:uiState.tickets})
});
vm.runInContext(fs.readFileSync('public/panel.js','utf8').replace(/^import .*;$/gm,''),panelContext);
await new Promise(resolve => setImmediate(resolve));
assert.equal(element('next').disabled,true,'A desk must be chosen before calling.');
element('desk').value = 'Sala UI'; element('desk').oninput();
element('service').value = 'enfermaria'; element('service').onchange();
await element('next').onclick();
assert.equal(uiA.desk,'Sala UI');
assert.equal(element('start').disabled,false);
assert.equal(element('finish').disabled,true);
uiAction('call_next',{serviceId:'enfermaria',desk:'Outra sala'});
await element('start').onclick();
assert.equal(element('finish').disabled,false);
await element('finish').onclick();
assert.equal(uiA.status,'concluida');
assert.equal(uiB.status,'chamada');
assert.equal(element('next').disabled,false);
assert.match(element('historyRows').innerHTML,/Concluída/);
assert.match(element('activeDesks').innerHTML,/Outra sala/);
element('sectorName').value = 'Psicologia'; element('sectorPrefix').value = 'ps';
await element('sectorForm').onsubmit({preventDefault() {}});
const psychology = uiState.services.find(service => service.name === 'Psicologia');
assert.ok(psychology);
assert.equal(psychology.prefix,'PS');
assert.equal(element('service').value,psychology.id);
assert.match(element('sectorRows').innerHTML,new RegExp(`retirar.html\\?setor=${psychology.id}`));
assert.equal(element('sectorName').value,'');
const firstPS = uiAction('take',{serviceId:psychology.id}).ticket;
const secondPS = uiAction('take',{serviceId:psychology.id}).ticket;
assert.equal(firstPS.code,'PS001'); assert.equal(secondPS.code,'PS002');
assert.equal(uiState.services.find(service => service.id === 'enfermaria').nextNumber,3);
assert.throws(() => uiAction('create_service',{name:'PSICÓLOGIA',prefix:'PSI'}),/nome/);
assert.throws(() => uiAction('create_service',{name:'Outro setor',prefix:'ps'}),/prefixo/);
assert.throws(() => uiAction('create_service',{name:'Outro setor',prefix:'P1'}),/letras/);
assert.throws(() => uiAction('create_service',{name:'Outro setor',prefix:'ABCD'}),/letras/);
assert.throws(() => uiAction('create_service',{name:'A',prefix:'Z'}),/nome/);
const serviceStore = new Store(defaultState());
const serviceSession = (await serviceStore.get('estado')).session.id;
const creations = await Promise.allSettled([1,2].map(() => mutate(serviceStore,{action:'create_service',sessionId:serviceSession,name:'Serviço Social',prefix:'SS'})));
assert.equal(creations.filter(result => result.status === 'fulfilled').length,1);
assert.equal((await serviceStore.get('estado')).services.filter(service => service.prefix === 'SS').length,1);
const unauthorized = await handle(new Request('https://example.test/api/state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'create_service',sessionId:serviceSession,name:'Outro setor',prefix:'OT'})}),serviceStore);
assert.equal(unauthorized.status,401);
await mutate(serviceStore,{action:'close_day',sessionId:serviceSession});
await mutate(serviceStore,{action:'create_service',sessionId:serviceSession,name:'Sala de Curativos',prefix:'C'});
const tomorrow = await serviceStore.get('estado');
applyAction(tomorrow,{action:'open_day',sessionId:serviceSession},new Date(Date.now()+86400000).toISOString());
assert.ok(tomorrow.services.some(service => service.prefix === 'SS'));
assert.ok(tomorrow.services.some(service => service.prefix === 'C'));
assert.ok(tomorrow.services.every(service => service.nextNumber === 1));

const agenda = defaultState(time);
const book = (action,payload = {},now = time) => applyAction(agenda,{action,sessionId:agenda.session.id,desk:'Recepção 01',...payload},now);
const slot = {patientName:'Pessoa de teste',serviceId:'consultorio-medico',room:'Consultório 01',date:'2026-09-06',time:'10:00',duration:30};
const booking = book('create_appointment',slot).appointment;
assert.equal(booking.createdByDesk,'Recepção 01');
assert.equal(agenda.tickets.length,0,'Booking must not issue a queue ticket.');
assert.equal(adminState(agenda,'2026-09-06').appointments.length,1);
assert.equal(adminState(agenda,'2026-09-07').appointments.length,0);
assert.ok(!('appointments' in publicState(agenda)));
assert.throws(() => book('create_appointment',{...slot,time:'10:15',serviceId:'odontologico'}),/intervalo/);
assert.throws(() => book('create_appointment',{...slot,room:'CONSULTORIO 01'}),/intervalo/);
book('create_appointment',{...slot,room:'Consultório 02'});
book('create_appointment',{...slot,time:'10:30'});
assert.throws(() => book('create_appointment',{...slot,date:'2026-02-30'}),/data válida/);
assert.throws(() => book('create_appointment',{...slot,time:'08:00'}),/passaram/);
assert.throws(() => book('create_appointment',{...slot,time:'23:50'}),/mesmo dia/);
assert.throws(() => book('create_appointment',{...slot,desk:''}),/guichê/);
book('reschedule_appointment',{...slot,appointmentId:booking.id,expectedVersion:1,time:'11:00'});
assert.equal(booking.time,'11:00');
assert.equal(booking.events[0].time,'10:00');
assert.throws(() => book('cancel_appointment',{appointmentId:booking.id,expectedVersion:1}),/outro guichê/);
assert.throws(() => book('appointment_absent',{appointmentId:booking.id,expectedVersion:2}),/Aguarde/);
const arrived = book('appointment_checkin',{appointmentId:booking.id,expectedVersion:2});
const arrivedAgain = book('appointment_checkin',{appointmentId:booking.id,expectedVersion:2});
assert.equal(arrived.ticket.id,arrivedAgain.ticket.id);
assert.equal(agenda.tickets.length,1);
assert.equal(arrived.ticket.appointmentId,booking.id);
assert.throws(() => book('cancel_appointment',{appointmentId:booking.id,expectedVersion:3}),/fila/);
const nextAppointment = book('create_appointment',{...slot,date:'2026-09-07'}).appointment;
assert.throws(() => book('appointment_checkin',{appointmentId:nextAppointment.id,expectedVersion:1}),/data da consulta/);
book('cancel_ticket',{ticketId:arrived.ticket.id}); book('close_day');
book('create_appointment',{...slot,date:'2026-09-08'});
book('open_day',{},nextDay);
assert.ok(agenda.appointments.some(item => item.id === nextAppointment.id));
assert.equal(agenda.tickets.length,0);

const arrivingState = defaultState();
const currentDate = arrivingState.session.date;
const ready = applyAction(arrivingState,{action:'create_appointment',sessionId:arrivingState.session.id,desk:'Recepção',...slot,date:currentDate},currentDate+'T03:00:00Z').appointment;
const arrivalStore = new Store(arrivingState);
const arrivals = await Promise.all([1,2].map(() => mutate(arrivalStore,{action:'appointment_checkin',sessionId:arrivingState.session.id,desk:'Recepção',appointmentId:ready.id,expectedVersion:1})));
assert.equal(arrivals[0].output.ticket.id,arrivals[1].output.ticket.id);
assert.equal((await arrivalStore.get('estado')).tickets.length,1);
const agendaUrl = `https://example.test/api/state?admin=1&agendaDate=${currentDate}`;
assert.equal((await handle(new Request(agendaUrl),arrivalStore)).status,401);
assert.equal((await (await handle(new Request(agendaUrl,{headers:{'x-panel-pin':pin}}),arrivalStore)).json()).appointments.length,1);
const publicReply = await (await handle(new Request('https://example.test/api/state'),arrivalStore)).json();
assert.ok(!JSON.stringify(publicReply).includes('Pessoa de teste'));
const futureDate = businessDate(new Date(Date.now()+86400000).toISOString());
const simultaneousBookings = await Promise.allSettled([1,2].map(() => mutate(arrivalStore,{action:'create_appointment',sessionId:arrivingState.session.id,desk:'Recepção',...slot,date:futureDate})));
assert.equal(simultaneousBookings.filter(result => result.status === 'fulfilled').length,1);

// UI: schedule, reschedule, cancel, confirm arrival, and recover a failed print.
element('appointmentName').value = 'Paciente da agenda'; element('appointmentService').value = psychology.id;
element('appointmentRoom').value = 'Sala Psicologia'; element('appointmentDate').value = futureDate;
element('appointmentTime').value = '10:00'; element('appointmentDuration').value = '30';
await element('appointmentForm').onsubmit({preventDefault() {}});
const uiBooking = uiState.appointments.find(item => item.patientName === 'Paciente da agenda');
assert.ok(uiBooking); assert.equal(uiBooking.createdByDesk,'Sala UI');
assert.equal(element('agendaDate').value,futureDate);
assert.match(element('appointmentRows').innerHTML,/Paciente da agenda/);
const agendaClick = (id,action) => element('appointmentRows').onclick({target:{closest:() => ({disabled:false,dataset:{appointmentId:id,appointmentAction:action}})}});
await agendaClick(uiBooking.id,'edit');
element('appointmentTime').value = '11:00';
await element('appointmentForm').onsubmit({preventDefault() {}});
assert.equal(uiBooking.time,'11:00');
await agendaClick(uiBooking.id,'cancel_appointment'); assert.equal(uiBooking.status,'cancelada');
const present = applyAction(uiState,{action:'create_appointment',sessionId:uiState.session.id,desk:'Sala UI',...slot,date:uiState.session.date},uiState.session.date+'T03:00:00Z').appointment;
uiState.revision++;
element('agendaDate').value = uiState.session.date; await element('refreshAgenda').onclick();
const beforeArrival = uiState.tickets.length;
await agendaClick(present.id,'appointment_checkin');
assert.equal(uiState.tickets.length,beforeArrival+1);
assert.equal(present.status,'compareceu');
assert.equal(printedAppointments.length,1);
await agendaClick(present.id,'print');
assert.equal(uiState.tickets.length,beforeArrival+1);
assert.equal(printedAppointments.length,2);
console.log('OK: independent desks, lifecycle, stale actions, migration, concurrent writes, archive failure/retrieval, day rollover, paged announcements, sequential playback and panel controls.');
console.log('OK: sector form, independent numbering, duplicate validation, concurrent creation, PIN protection and sectors preserved across days.');
console.log('OK: booking conflicts, rescheduling, protected agendas, concurrent arrival without duplicate tickets, persistence across days and scheduling UI with print recovery.');
