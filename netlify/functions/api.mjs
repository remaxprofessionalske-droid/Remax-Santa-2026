import { getStore } from '@netlify/blobs';
import { createHash, randomInt, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
const nickKey = n => String(n).trim().normalize('NFKC').toLocaleLowerCase('en').replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const oldSlug = n => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'p';
const legacyHash = (n,p) => createHash('sha256').update(oldSlug(n) + ':' + p + ':santa').digest('hex');
const hashPIN = pin => { const salt = randomBytes(16).toString('hex'); return `scrypt:${salt}:${scryptSync(pin, salt, 32).toString('hex')}`; };
function validPIN(pin, stored, nick) {
  if (!/^\d{4}$/.test(String(pin)) || !stored) return false;
  if (!stored.startsWith('scrypt:')) return stored === legacyHash(nick, pin);
  const [, salt, digest] = stored.split(':');
  try { return timingSafeEqual(Buffer.from(digest, 'hex'), scryptSync(String(pin), salt, 32)); } catch { return false; }
}
const strong = { type: 'json', consistency: 'strong' };
async function getJSON(s, key) { return await s.get(key, strong); }
async function players(s) {
  const { blobs } = await s.list({ prefix: 'p/' });
  const all = await Promise.all(blobs.map(x => getJSON(s, x.key)));
  return all.filter(Boolean).sort((a,b) => a.at - b.at);
}
const isOpen = m => !m.pairs && (!m.closeAt || Date.now() < m.closeAt);
const canReveal = m => !!m.pairs && (!m.drawAt || Date.now() >= m.drawAt);
const safeTime = v => v === null || v === '' || v === undefined ? null : (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : NaN);
const secureEqual = (a, b) => {
  const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};

export default async function handler(req) {
  try {
    const s = getStore('remax-secret-santa');
    const path = new URL(req.url).pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
    const meta = (await getJSON(s, 'meta')) || { pairs: null, drawAt: null, closeAt: null };
    if (req.method !== 'GET' && req.method !== 'POST') return reply({ error: 'Method not allowed.' }, 405);
    let body = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { return reply({ error: 'Invalid request.' }, 400); }
    }
    if (path === 'state' && req.method === 'GET') {
      const ps = await players(s);
      return reply({ players: ps.map(p => p.nick), drawn: !!meta.pairs, drawAt: meta.drawAt || null,
        closeAt: meta.closeAt || null, open: isOpen(meta), ready: canReveal(meta), now: Date.now() });
    }
    if (path === 'join' && req.method === 'POST') {
      const nick = String(body.nick || '').trim().normalize('NFKC');
      const key = nickKey(nick), pin = String(body.pin || ''), gender = String(body.gender || '');
      if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]{1,23}$/.test(nick) || key.length < 2) return reply({ error: 'Use 2–24 characters: letters, numbers, spaces, _ or -.' }, 400);
      if (!['Male','Female','Prefer not to say'].includes(gender)) return reply({ error: 'Please choose a gender option.' }, 400);
      if (!/^\d{4}$/.test(pin)) return reply({ error: 'Enter exactly four PIN digits.' }, 400);
      if (!isOpen(meta)) return reply({ error: 'Registration has closed.' }, 409);
      const ps = await players(s);
      if (ps.some(p => nickKey(p.nick) === key || oldSlug(p.nick) === oldSlug(nick))) return reply({ error: 'Nickname already taken. Please choose another.' }, 409);
      // Each participant is saved as their own durable Netlify Blob.
      await s.setJSON('p/' + key, { nick, gender, pin: hashPIN(pin), at: Date.now(), fails: 0, lock: 0 });
      return reply({ ok: true, nick });
    }
    if (path === 'reveal' && req.method === 'POST') {
      if (!canReveal(meta)) return reply({ error: 'Matches have not been released yet.' }, 403);
      const nick = String(body.nick || '').trim();
      const participant = await getJSON(s, 'p/' + nickKey(nick)) || await getJSON(s, 'p/' + oldSlug(nick));
      if (!participant) return reply({ error: 'Nickname or PIN is incorrect.' }, 401);
      if (participant.lock > Date.now()) return reply({ error: 'Too many attempts. Try again after 10 minutes.' }, 429);
      const key = 'p/' + (await getJSON(s, 'p/' + nickKey(nick)) ? nickKey(nick) : oldSlug(nick));
      if (!validPIN(body.pin, participant.pin, participant.nick)) {
        participant.fails = (participant.fails || 0) + 1;
        if (participant.fails >= 5) { participant.lock = Date.now() + 10 * 60_000; participant.fails = 0; }
        await s.setJSON(key, participant);
        return reply({ error: 'Nickname or PIN is incorrect.' }, 401);
      }
      if (participant.fails || participant.lock) {
        participant.fails = 0; participant.lock = 0;
        await s.setJSON(key, participant);
      }
      const match = meta.pairs[participant.nick];
      if (!match) return reply({ error: 'No match found. Contact the organiser.' }, 404);
      const recipient = await getJSON(s, 'p/' + nickKey(match)) || await getJSON(s, 'p/' + oldSlug(match));
      return reply({ match, gender: recipient?.gender === 'Prefer not to say' ? null : recipient?.gender || null });
    }
    if (!process.env.ADMIN_KEY || process.env.ADMIN_KEY.length < 12) {
      return reply({ error: 'Organiser setup is incomplete. Add an ADMIN_KEY of at least 12 characters in Netlify.' }, 503);
    }
    if (req.method !== 'POST' || !secureEqual(body.key || '', process.env.ADMIN_KEY)) return reply({ error: 'Incorrect organiser password.' }, 401);
    if (path === 'admin-check') return reply({ ok: true });
    if (path === 'admin-matches') {
      if (!meta.pairs) return reply({ error: 'No draw has been completed yet.' }, 409);
      const ps = await players(s);
      const genderByNick = new Map(ps.map(p => [p.nick, p.gender]));
      return reply({ matches: Object.entries(meta.pairs).map(([giver, recipient]) => ({
        giver, recipient,
        recipientGender: genderByNick.get(recipient) === 'Prefer not to say' ? '' : (genderByNick.get(recipient) || '')
      })) });
    }
    if (path === 'config') {
      const drawAt = safeTime(body.drawAt), closeAt = safeTime(body.closeAt);
      if (Number.isNaN(drawAt) || Number.isNaN(closeAt)) return reply({ error: 'Invalid date or time.' }, 400);
      meta.drawAt = drawAt; meta.closeAt = closeAt;
      await s.setJSON('meta', meta);
      return reply({ ok: true });
    }
    if (path === 'draw') {
      if (meta.pairs) return reply({ error: 'The draw has already taken place.' }, 409);
      const ps = await players(s);
      if (ps.length < 3) return reply({ error: 'At least three participants are required.' }, 400);
      const names = ps.map(p => p.nick);
      // A cryptographically secure Fisher–Yates shuffle, followed by a circular permutation.
      for (let i = names.length - 1; i > 0; i--) {
        const j = randomInt(i + 1); [names[i], names[j]] = [names[j], names[i]];
      }
      const pairs = {};
      names.forEach((n, i) => { pairs[n] = names[(i + 1) % names.length]; });
      meta.pairs = pairs;
      await s.setJSON('meta', meta);
      return reply({ ok: true, participants: names.length, ready: canReveal(meta) });
    }
    if (path === 'reset') {
      if (body.confirm !== 'RESET') return reply({ error: 'Reset confirmation required.' }, 400);
      const { blobs } = await s.list({ prefix: 'p/' });
      await Promise.all(blobs.map(x => s.delete(x.key)));
      await s.delete('meta');
      return reply({ ok: true });
    }
    return reply({ error: 'Not found.' }, 404);
  } catch (err) {
    console.error('Secret Santa API error:', err);
    return reply({ error: 'Server error. Please try again shortly.' }, 500);
  }
}
export const config = { path: '/api/*' };
