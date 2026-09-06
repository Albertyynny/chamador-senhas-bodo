import { getStore } from '@netlify/blobs';
import { defaultState, migrateState, applyAction, publicState, adminState } from './lib/queue.mjs';

const STATE_KEY = 'estado';
const ADMIN_PIN = process.env.PAINEL_PIN || '2468';
const json = (data,status = 200) => Response.json(data,{status,headers:{'Cache-Control':'no-store, no-cache, must-revalidate'}});
const requireAdmin = req => req.headers.get('x-panel-pin') === ADMIN_PIN;
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
export async function handle(req,store) {
  try {
    const url = new URL(req.url);
    if (req.method === 'GET') {
      const admin = url.searchParams.get('admin') === '1';
      if ((admin || url.searchParams.has('history')) && !requireAdmin(req)) return json({error:'PIN inválido.'},401);
      const {state} = await readState(store);
      if (url.searchParams.has('history')) {
        const id = url.searchParams.get('history');
        if (id === 'legacy') return json({legacy:true,events:state.legacyHistory,tickets:[]});
        if (id === state.session.id) return json({session:state.session,tickets:state.tickets,calls:state.calls});
        const archive = state.archives.find(item => item.id === id);
        if (!archive) return json({error:'Histórico não encontrado.'},404);
        const data = await store.get(archive.key,{type:'json',consistency:'strong'});
        if (!data) return json({error:'Histórico indisponível. Tente novamente.'},503);
        return json(data);
      }
      return json(admin ? adminState(state,url.searchParams.get('agendaDate') || undefined) : publicState(state,url.searchParams));
    }
    if (req.method !== 'POST') return json({error:'Método não permitido.'},405);
    const body = await req.json().catch(() => ({}));
    if (body.action !== 'take' && !requireAdmin(req)) return json({error:'PIN inválido.'},401);
    if (body.action === 'verify_pin') return json({ok:true});
    const {state,output} = await mutate(store,body);
    return json({ok:true,...output,state:body.action === 'take' ? publicState(state) : adminState(state,body.agendaDate || undefined)});
  } catch (error) {
    console.error(error);
    return json({error:error?.message || 'Erro interno.'},400);
  }
}
export default req => handle(req,getStore({name:'fila-atendimento',consistency:'strong'}));
