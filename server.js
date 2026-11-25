import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function send(res, status, body) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(status).json(body);
}

export function failure(res, error) {
  if (!error.status && error.name !== 'Error') console.error(error);
  send(res, error.status || 503, { error: error.status ? error.message : 'Service momentanément indisponible.' });
}

export function guard(req, method) {
  if (req.method !== method) throw new HttpError(405, 'Méthode indisponible.');
  if (method === 'POST') {
    const origin = req.headers.origin;
    if (!origin || new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Origine refusée.');
  }
}

function getCookie(req, name) {
  return String(req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(name + '='))?.slice(name.length + 1) ?? '';
}
function setCookie(res, name, v, age) {
  const previous = res.getHeader('Set-Cookie') || [];
  res.setHeader('Set-Cookie', [...(Array.isArray(previous) ? previous : [previous]), `${name}=${v}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`]);
}
export function getActor(req, res) {
  const old = getCookie(req, 'moadon_visitor');
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(old)) return old;
  const actor = randomUUID();
  setCookie(res, 'moadon_visitor', actor, 365 * 86400);
  return actor;
}

function secret() {
  const key = process.env.MOADON_ADMIN_SECRET;
  if (!key || key.length < 24) throw new HttpError(503, 'Le code administrateur doit être configuré.');
  return key;
}
function same(a, b) {
  const av = Buffer.from(a);
  const bv = Buffer.from(b);
  return av.length === bv.length && timingSafeEqual(av, bv);
}
function sign(value) {
  return createHmac('sha256', secret()).update('moadon-admin:' + value).digest('hex');
}
export function admin(req) {
  const raw = getCookie(req, 'moadon_admin');
  const [exp, mac] = raw.split('.');
  return /^\d{13}$/.test(exp) && Number(exp) > Date.now() && !!mac && same(mac, sign(exp));
}
export function login(res, code) {
  if (typeof code !== 'string' || code.length > 256 || !same(code, secret())) throw new HttpError(401, 'Code administrateur incorrect.');
  const exp = String(Date.now() + 12 * 3600000);
  setCookie(res, 'moadon_admin', exp + '.' + sign(exp), 12 * 3600);
}
export function logout(res) { setCookie(res, 'moadon_admin', '', 0); }

export async function json(req, max = 900000) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Format de requête invalide.');
  if (Number(req.headers['content-length']) > max) throw new HttpError(413, 'Le contenu est trop long.');
  try {
    const obj = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error();
    return obj;
  } catch { throw new HttpError(400, 'Requête invalide.'); }
}

export async function supabase(path, init = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new HttpError(503, 'La base Supabase doit être connectée.');
  const response = await fetch(url.replace(/\/$/, '') + path, {
    ...init,
    headers: { apikey: key, ...(key.startsWith('ey') ? { Authorization: 'Bearer ' + key } : {}), ...init.headers },
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) {
    console.error('Supabase', response.status);
    throw new HttpError(503, 'La base ou le stockage Supabase est indisponible.');
  }
  return response;
}

export async function current() {
  const response = await supabase('/rest/v1/moadon_state?id=eq.1&select=body,revision');
  const [row] = await response.json();
  if (!row) throw new HttpError(503, 'Le script Supabase doit être exécuté.');
  return row;
}

export async function mutate(operation) {
  for (let tries = 0; tries < 15; tries++) {
    const { body, revision } = await current();
    const result = operation(body);
    if (!result.write) return { body, result: result.output };
    const response = await supabase('/rest/v1/moadon_state?id=eq.1&revision=eq.' + revision + '&select=revision', {
      method: 'PATCH', headers: {'Content-Type':'application/json', Prefer:'return=representation'},
      body: JSON.stringify({ body, revision: Number(revision) + 1 })
    });
    if ((await response.json()).length) return { body, result: result.output };
    await new Promise(resolve => setTimeout(resolve, 15 + Math.random() * Math.min(tries * 14, 150)));
  }
  throw new HttpError(409, 'Plusieurs réponses arrivent en même temps. Réessaie dans un instant.');
}
