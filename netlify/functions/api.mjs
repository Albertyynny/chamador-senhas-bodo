import { getStore } from '@netlify/blobs';
import { defaultState, migrateState, applyAction, publicState, adminState, serviceState } from './lib/queue.mjs';

const STATE_KEY = 'estado';
const BOOTSTRAP_ADMIN_PIN = process.env.PAINEL_PIN || '2468';
const json = (data,status = 200) => Response.json(data,{status,headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}});
const pinFrom = req => req.headers.get('x-panel-pin') || '';
function authenticate(state,pin) {
  if (state.auth?.adminPin && pin === state.auth.adminPin) return {role:'admin'};
  if (!state.auth?.adminPin && !Object.keys(state.auth?.servicePins || {}).length && pin === BOOTSTRAP_ADMIN_PIN) return {role:'admin'};
  const serviceId = Object.entries(state.auth?.servicePins || {}).find(([,value]) => value === pin)?.[0];
  return serviceId ? {role:'service',serviceId} : null;
}
export async function readState(store) {
  let result = await store.getWithMetadata(STATE_KEY,{consistency:'strong'});
  if (!result?.data) {
    await store.setJSON(STATE_KEY,defaultState(),{onlyIfNew:true});
    result = await store.getWithMetadata(STATE_KEY,{consistency:'strong'});
  }
  if (!result?.data || !result.etag) throw new Error('Não foi possível carregar o estado do atendimento.');
  return {state:migrateState(JSON.parse(result.data)),etag:result.etag};
}
export async function mutate(store, body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const {state,etag} = await readState(store);
    const output = applyAction(state,body);
    state.updatedAt = new Date().toISOString();
    state.revision++;
    if (output.archive) {
      // Save before publishing the index: failure leaves the day open.
      // A CAS conflict retries using a fresh, immutable snapshot.
      const key = `history/${crypto.randomUUID()}`;
      const archived = await store.setJSON(key,{session:state.session,tickets:state.tickets,calls:state.calls},{onlyIfNew:true});
      if (!archived.modified) throw new Error('Não foi possível salvar o histórico. O dia permanece aberto.');
      state.archives = [...state.archives.filter(item => item.id !== state.session.id),
        {id:state.session.id,date:state.session.date,closedAt:state.session.closedAt,key,count:state.tickets.length}];
    }
    const result = await store.setJSON(STATE_KEY,state,{onlyIfMatch:etag});
    if (result.modified) return {state,output};
  }
  throw new Error('Outro atendente atualizou a fila. Confira o painel e tente novamente.');
}
async function setupAdmin(store,pin) {
  if (!/^\d{4,12}$/.test(String(pin || ''))) throw new Error('Cadastre um PIN numérico com 4 a 12 dígitos.');
  for (let attempt = 0; attempt < 6; attempt++) {
    const {state,etag} = await readState(store);
    if (state.auth?.adminPin) throw new Error('O administrador geral já foi cadastrado.');
    state.auth ||= {adminPin:null,servicePins:{}};
    state.auth.adminPin = String(pin);
    state.updatedAt = new Date().toISOString(); state.revision++;
    const result = await store.setJSON(STATE_KEY,state,{onlyIfMatch:etag});
    if (result.modified) return {state,output:{role:'admin'}};
  }
  throw new Error('Outro acesso atualizou o cadastro. Tente novamente.');
}
export async function handle(req,store) {
  try {
    const url = new URL(req.url);
    const {state:currentState} = await readState(store);
    if (req.method === 'GET') {
      if (url.searchParams.get('setup') === '1') return json({configured:!!currentState.auth?.adminPin});
      const admin = url.searchParams.get('admin') === '1';
      const auth = authenticate(currentState,pinFrom(req));
      if ((admin || url.searchParams.has('history')) && !auth) return json({error:'PIN inválido.'},401);
      const state = currentState;
      if (url.searchParams.has('history')) {
        if (auth.role !== 'admin') return json({error:'Somente o administrador geral pode consultar o histórico.'},403);
        const id = url.searchParams.get('history');
        if (id === 'legacy') return json({legacy:true,events:state.legacyHistory,tickets:[]});
        if (id === state.session.id) return json({session:state.session,tickets:state.tickets,calls:state.calls});
        const archive = state.archives.find(item => item.id === id);
        if (!archive) return json({error:'Histórico não encontrado.'},404);
        const data = await store.get(archive.key,{type:'json',consistency:'strong'});
        if (!data) return json({error:'Histórico indisponível. Tente novamente.'},503);
        return json(data);
      }
      if (!admin) return json(publicState(state,url.searchParams));
      return json(auth.role === 'admin' ? {...adminState(state,url.searchParams.get('agendaDate') || undefined),role:'admin'} : {...serviceState(state,auth.serviceId),role:'service',serviceId:auth.serviceId});
    }
    if (req.method !== 'POST') return json({error:'Método não permitido.'},405);
    const body = await req.json().catch(() => ({}));
    if (body.action === 'setup_admin') {
      const result = await setupAdmin(store,body.pin);
      return json({ok:true,...result.output});
    }
    const auth = authenticate(currentState,pinFrom(req));
    if (body.action === 'take') {
      const {state,output} = await mutate(store,body);
      return json({ok:true,...output,state:publicState(state)});
    }
    if (body.action === 'verify_pin') return auth ? json({ok:true,...auth}) : json({error:'PIN inválido.'},401);
    if (!auth) return json({error:'PIN inválido.'},401);
    const {state,output} = await mutate(store,{...body,auth});
    const view = auth.role === 'admin' ? {...adminState(state,body.agendaDate || undefined),role:'admin'} : {...serviceState(state,auth.serviceId),role:'service',serviceId:auth.serviceId};
    return json({ok:true,...output,state:view});
  } catch (error) {
    console.error(error);
    return json({error:error?.message || 'Erro interno.'},400);
  }
}
export default req => handle(req,getStore({name:'fila-atendimento',consistency:'strong'}));
