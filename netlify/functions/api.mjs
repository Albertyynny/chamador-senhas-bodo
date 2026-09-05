import { getStore } from '@netlify/blobs';

const STORE_NAME = 'fila-atendimento';
const STATE_KEY = 'estado';
const ADMIN_PIN = process.env.PAINEL_PIN || '2468';

const defaultState = () => ({
  version: 1,
  updatedAt: new Date().toISOString(),
  current: null,
  lastCalls: [],
  services: [
    { id: 'odontologico', name: 'Odontológico', prefix: 'O', nextNumber: 1, queue: [] },
    { id: 'consultorio-medico', name: 'Consultório Médico', prefix: 'M', nextNumber: 1, queue: [] },
    { id: 'nutricionista', name: 'Nutricionista', prefix: 'N', nextNumber: 1, queue: [] },
    { id: 'fisioterapia', name: 'Fisioterapia', prefix: 'F', nextNumber: 1, queue: [] },
    { id: 'exames-laboratoriais', name: 'Exames Laboratoriais', prefix: 'L', nextNumber: 1, queue: [] },
    { id: 'enfermaria', name: 'Enfermaria', prefix: 'E', nextNumber: 1, queue: [] }
  ],
  history: []
});

const json = (data, status = 200, headers = {}) => Response.json(data, {
  status,
  headers: {
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    ...headers
  }
});

function cleanDesk(value) {
  return String(value || '').trim().slice(0, 30) || 'Atendimento';
}

function ticketCode(service, number) {
  return `${service.prefix}${String(number).padStart(3, '0')}`;
}

function publicState(state) {
  return {
    updatedAt: state.updatedAt,
    current: state.current,
    lastCalls: state.lastCalls.slice(0, 6),
    services: state.services.map(s => ({
      id: s.id,
      name: s.name,
      prefix: s.prefix,
      waiting: s.queue.length,
      nextNumber: s.nextNumber
    }))
  };
}

async function readState(store) {
  const result = await store.getWithMetadata(STATE_KEY, { consistency: 'strong' });
  if (!result?.data) {
    const initial = defaultState();
    await store.setJSON(STATE_KEY, initial, { onlyIfNew: true });
    const reread = await store.getWithMetadata(STATE_KEY, { consistency: 'strong' });
    if (reread?.data) return { state: JSON.parse(reread.data), etag: reread.etag };
    return { state: initial, etag: null };
  }
  return { state: JSON.parse(result.data), etag: result.etag };
}

async function mutate(store, fn) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const { state, etag } = await readState(store);
    const cloned = structuredClone(state);
    const output = await fn(cloned);
    cloned.updatedAt = new Date().toISOString();

    const options = etag ? { onlyIfMatch: etag } : { onlyIfNew: true };
    const result = await store.setJSON(STATE_KEY, cloned, options);
    if (result.modified) return { state: cloned, output };
  }
  throw new Error('Conflito ao atualizar a fila. Tente novamente.');
}

function requireAdmin(req) {
  const pin = req.headers.get('x-panel-pin') || '';
  return pin === ADMIN_PIN;
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const store = getStore({ name: STORE_NAME, consistency: 'strong' });

    if (req.method === 'GET') {
      const { state } = await readState(store);
      if (url.searchParams.get('admin') === '1') {
        if (!requireAdmin(req)) return json({ error: 'PIN inválido.' }, 401);
        return json(state);
      }
      return json(publicState(state));
    }

    if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'take') {
      const result = await mutate(store, (state) => {
        const service = state.services.find(s => s.id === body.serviceId);
        if (!service) throw new Error('Tipo de atendimento inválido.');
        const number = service.nextNumber++;
        const ticket = {
          code: ticketCode(service, number),
          serviceId: service.id,
          serviceName: service.name,
          createdAt: new Date().toISOString()
        };
        service.queue.push(ticket);
        return ticket;
      });
      return json({ ok: true, ticket: result.output, state: publicState(result.state) });
    }

    if (!requireAdmin(req)) return json({ error: 'PIN inválido.' }, 401);

    if (action === 'verify_pin') return json({ ok: true });

    if (action === 'call_next') {
      const result = await mutate(store, (state) => {
        const service = state.services.find(s => s.id === body.serviceId);
        if (!service) throw new Error('Tipo de atendimento inválido.');
        if (!service.queue.length) throw new Error('Não há senhas aguardando neste atendimento.');
        const ticket = service.queue.shift();
        const call = {
          ...ticket,
          desk: cleanDesk(body.desk),
          calledAt: new Date().toISOString(),
          callId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        };
        state.current = call;
        state.lastCalls = [call, ...state.lastCalls.filter(c => c.code !== call.code)].slice(0, 12);
        state.history.unshift({ ...call, status: 'chamada' });
        state.history = state.history.slice(0, 2000);
        return call;
      });
      return json({ ok: true, call: result.output, state: result.state });
    }

    if (action === 'recall') {
      const result = await mutate(store, (state) => {
        if (!state.current) throw new Error('Ainda não há uma senha chamada.');
        const call = {
          ...state.current,
          desk: cleanDesk(body.desk || state.current.desk),
          calledAt: new Date().toISOString(),
          callId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          recalled: true
        };
        state.current = call;
        state.lastCalls = [call, ...state.lastCalls.filter(c => c.code !== call.code)].slice(0, 12);
        state.history.unshift({ ...call, status: 'rechamada' });
        state.history = state.history.slice(0, 2000);
        return call;
      });
      return json({ ok: true, call: result.output, state: result.state });
    }

    if (action === 'call_specific') {
      const wanted = String(body.code || '').trim().toUpperCase();
      const result = await mutate(store, (state) => {
        let ticket = null;
        for (const service of state.services) {
          const index = service.queue.findIndex(t => t.code === wanted);
          if (index >= 0) {
            ticket = service.queue.splice(index, 1)[0];
            break;
          }
        }
        if (!ticket) throw new Error('Senha não encontrada na fila.');
        const call = {
          ...ticket,
          desk: cleanDesk(body.desk),
          calledAt: new Date().toISOString(),
          callId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        };
        state.current = call;
        state.lastCalls = [call, ...state.lastCalls.filter(c => c.code !== call.code)].slice(0, 12);
        state.history.unshift({ ...call, status: 'chamada manual' });
        state.history = state.history.slice(0, 2000);
        return call;
      });
      return json({ ok: true, call: result.output, state: result.state });
    }

    if (action === 'finish') {
      const result = await mutate(store, (state) => {
        const old = state.current;
        state.current = null;
        return old;
      });
      return json({ ok: true, state: result.state });
    }

    if (action === 'reset') {
      const result = await mutate(store, (state) => {
        const keepServices = state.services.map(s => ({ ...s, nextNumber: 1, queue: [] }));
        state.current = null;
        state.lastCalls = [];
        state.history = [];
        state.services = keepServices;
        return true;
      });
      return json({ ok: true, state: result.state });
    }

    if (action === 'remove_ticket') {
      const code = String(body.code || '').trim().toUpperCase();
      const result = await mutate(store, (state) => {
        for (const service of state.services) {
          const i = service.queue.findIndex(t => t.code === code);
          if (i >= 0) return service.queue.splice(i, 1)[0];
        }
        throw new Error('Senha não encontrada.');
      });
      return json({ ok: true, removed: result.output, state: result.state });
    }

    return json({ error: 'Ação inválida.' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error?.message || 'Erro interno.' }, 400);
  }
};
