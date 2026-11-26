function getSupabaseUrl() {
  return (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '');
}
function getSecretKey() {
  return process.env.SUPABASE_SECRET_KEY;
}

function restUrl(path) {
  return `${getSupabaseUrl()}/rest/v1/${path}`;
}

function headers(extra = {}) {
  const key = getSecretKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...extra,
  };
}

export function isDbConfigured() {
  return Boolean(getSupabaseUrl() && getSecretKey());
}

export async function getUser(userId) {
  const res = await fetch(restUrl(`app_users?id=eq.${encodeURIComponent(userId)}&select=*`), {
    headers: headers(),
  });
  const rows = await res.json();
  return rows[0] || null;
}

export async function upsertUser(userId, nickname) {
  const res = await fetch(restUrl('app_users'), {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify([{ id: userId, nickname }]),
  });
  const rows = await res.json();
  return rows[0];
}

export async function consumeToken(userId) {
  const user = await getUser(userId);
  const current = user?.tokens ?? 0;
  if (current <= 0) return false;
  await fetch(restUrl(`app_users?id=eq.${encodeURIComponent(userId)}`), {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ tokens: current - 1 }),
  });
  return true;
}

export async function grantShareBonus(userId) {
  const user = await getUser(userId);
  if (!user || user.share_bonus_used) return false;
  await fetch(restUrl(`app_users?id=eq.${encodeURIComponent(userId)}`), {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ tokens: (user.tokens ?? 0) + 1, share_bonus_used: true }),
  });
  return true;
}

const DAILY_LIMIT = 5;

function kstDateString() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function checkAndConsumeDailyUse(userId) {
  const user = await getUser(userId);
  const today = kstDateString();
  const sameDay = user?.daily_uses_date === today;
  const currentUses = sameDay ? user.daily_uses ?? 0 : 0;

  if (currentUses >= DAILY_LIMIT) {
    return { allowed: false, remaining: 0, limit: DAILY_LIMIT };
  }

  const newCount = currentUses + 1;
  await fetch(restUrl(`app_users?id=eq.${encodeURIComponent(userId)}`), {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ daily_uses: newCount, daily_uses_date: today }),
  });
  return { allowed: true, remaining: DAILY_LIMIT - newCount, limit: DAILY_LIMIT };
}

export async function getDailyUseStatus(userId) {
  const user = await getUser(userId);
  const today = kstDateString();
  const sameDay = user?.daily_uses_date === today;
  const currentUses = sameDay ? user?.daily_uses ?? 0 : 0;
  return { remaining: Math.max(0, DAILY_LIMIT - currentUses), limit: DAILY_LIMIT };
}

export async function addReview(userId, rating, comment) {
  await fetch(restUrl('reviews'), {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify([{ user_id: userId, rating, comment }]),
  });
}

export async function incrementVisit() {
  const res = await fetch(restUrl('site_stats?id=eq.main&select=visits'), { headers: headers() });
  if (!res.ok) throw new Error(`site_stats 조회 실패: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  const current = rows[0]?.visits || 0;
  const writeRes = await fetch(restUrl('site_stats'), {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify([{ id: 'main', visits: current + 1 }]),
  });
  if (!writeRes.ok) throw new Error(`site_stats 기록 실패: ${writeRes.status} ${await writeRes.text()}`);
  return current + 1;
}

export async function getVisitCount() {
  const res = await fetch(restUrl('site_stats?id=eq.main&select=visits'), { headers: headers() });
  if (!res.ok) throw new Error(`site_stats 조회 실패: ${res.status} ${await res.text()}`);
  const rows = await res.json();
  return rows[0]?.visits || 0;
}

export async function getReviewStats() {
  const res = await fetch(restUrl('reviews?select=rating,comment&order=id.desc&limit=200'), {
    headers: headers(),
  });
  const rows = await res.json();
  const count = rows.length;
  const avgRating = count ? rows.reduce((s, r) => s + r.rating, 0) / count : 0;
  const recent = rows.slice(0, 6).map((r) => ({ rating: r.rating, comment: r.comment }));
  return { count, avgRating: Math.round(avgRating * 10) / 10, recent };
}
