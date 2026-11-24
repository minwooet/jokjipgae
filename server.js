import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildAiPrompt, findCategory, CATEGORIES, getDailyNuance } from './analysis.js';
import { signSession, getSessionUserId } from './session.js';
import { getAuthorizeUrl, exchangeCodeForToken, fetchKakaoProfile } from './kakao.js';
import * as db from './db.js';
import { confirmPayment } from './toss.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const REVIEWS_FILE = path.join(__dirname, 'reviews.json');
const PORT = process.env.PORT || 3002;

function readReviewsFile() {
  if (!fs.existsSync(REVIEWS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeReviewsFile(reviews) {
  fs.writeFileSync(REVIEWS_FILE, JSON.stringify(reviews, null, 1));
}

loadEnvFile(path.join(__dirname, '.env'));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

function redirectUriFor(req) {
  const host = req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || (host?.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}/api/auth/kakao/callback`;
}

async function callClaudeVision(apiKey, imageBase64, mediaType, mode) {
  const prompt = buildAiPrompt(mode);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5-5',
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const textBlocks = (data?.content || []).filter((b) => b.type === 'text').map((b) => b.text);
  const text = textBlocks.join('\n');
  if (!text) {
    console.error('AI 전체 응답 구조(텍스트 없음):', JSON.stringify(data).slice(0, 2000));
  }
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.error('AI 원본 응답(파싱 실패):', text.slice(0, 1000));
    throw new Error('AI 응답 파싱 실패');
  }
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('AI 원본 응답(JSON.parse 실패):', text.slice(0, 1500));
    throw new Error('AI 응답 JSON 파싱 실패: ' + err.message);
  }
}

async function handleAnalyze(req, res) {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    try {
      const input = JSON.parse(body);
      const { imageBase64, mediaType, mode, clientIsFirstUse, clientHasBonusCredit } = input;
      if (!imageBase64) throw new Error('이미지가 없습니다.');

      const userId = db.isDbConfigured() ? getSessionUserId(req) : null;
      if (db.isDbConfigured() && !userId) {
        res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'LOGIN_REQUIRED', message: '로그인 후 이용할 수 있어요. 카카오 로그인을 먼저 해주세요.' }));
        return;
      }

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          error: 'AI 비전 분석 기능이 아직 설정되지 않았어요. 서버의 .env 파일에 ANTHROPIC_API_KEY를 넣어주세요.',
        }));
        return;
      }

      const parsed = await callClaudeVision(apiKey, imageBase64, mediaType || 'image/jpeg', mode);

      if (!parsed.faceDetected) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ faceDetected: false, reason: parsed.reason || '사진에서 사람 얼굴을 명확하게 찾지 못했어요.' }));
        return;
      }

      const cat = findCategory(parsed.category) || CATEGORIES[0];
      const compat = findCategory(parsed.compatibleWith) || CATEGORIES[1];

      // ---- 무료/보너스 사용 여부 판단 ----
      let unlockLevel = 'teaser';

      if (userId) {
        const user = (await db.getUser(userId)) || (await db.upsertUser(userId, null));
        if (!user.free_trial_used) {
          unlockLevel = 'full';
          await db.markFreeTrialUsed(userId);
        } else if (user.bonus_credits > 0) {
          unlockLevel = 'full';
          await db.useBonusCredit(userId);
        }
      } else {
        if (clientIsFirstUse || clientHasBonusCredit) unlockLevel = 'full';
      }

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        faceDetected: true,
        unlockLevel,
        category: cat.name,
        emoji: cat.emoji,
        color: cat.color,
        photo: cat.photo,
        compatiblePhoto: compat.photo,
        dailyNuance: getDailyNuance(cat.name),
        features: parsed.features,
        emotionalMessage: parsed.emotionalMessage,
        overallImpression: parsed.overallImpression,
        strengths: parsed.strengths,
        cautions: parsed.cautions,
        love: parsed.love,
        work: parsed.work,
        luckyItem: parsed.luckyItem,
        compatibleWith: compat.name,
        source: 'ai',
      }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

async function handleGetReviews(req, res) {
  if (db.isDbConfigured()) {
    try {
      const stats = await db.getReviewStats();
      const visits = await db.getVisitCount().catch(() => 0);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ...stats, visits }));
      return;
    } catch (err) {
      console.error('리뷰 조회 실패(DB):', err.message);
    }
  }
  const reviews = readReviewsFile();
  const count = reviews.length;
  const avgRating = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  const recent = reviews.slice(-6).reverse().map((r) => ({ rating: r.rating, comment: r.comment }));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ count, avgRating: Math.round(avgRating * 10) / 10, recent, visits: 0 }));
}

async function handleVisit(req, res) {
  let visits = 0;
  if (db.isDbConfigured()) {
    try {
      visits = await db.incrementVisit();
    } catch (err) {
      console.error('방문자 카운트 실패:', err.message);
    }
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ visits }));
}

function handlePostReview(req, res) {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    try {
      const { rating, comment } = JSON.parse(body);
      const r = Math.round(Number(rating));
      if (!(r >= 1 && r <= 5)) throw new Error('별점은 1~5 사이여야 해요.');
      const cleanComment = String(comment || '').slice(0, 300);

      const userId = db.isDbConfigured() ? getSessionUserId(req) : null;
      if (db.isDbConfigured()) {
        await db.addReview(userId, r, cleanComment);
        if (userId) await db.addBonusCredit(userId);
      } else {
        const reviews = readReviewsFile();
        reviews.push({ rating: r, comment: cleanComment, createdAt: new Date().toISOString() });
        writeReviewsFile(reviews);
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, loggedIn: Boolean(userId) }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

async function handleAuthMe(req, res) {
  const userId = db.isDbConfigured() ? getSessionUserId(req) : null;
  if (!userId) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ loggedIn: false }));
    return;
  }
  const user = await db.getUser(userId);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ loggedIn: true, nickname: user?.nickname, bonusCredits: user?.bonus_credits || 0 }));
}

function handleKakaoLogin(req, res) {
  if (!process.env.KAKAO_REST_API_KEY) {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('카카오 로그인이 아직 설정되지 않았어요 (KAKAO_REST_API_KEY 없음)');
    return;
  }
  const redirectUri = redirectUriFor(req);
  res.writeHead(302, { Location: getAuthorizeUrl(redirectUri) });
  res.end();
}

async function handleKakaoCallback(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const code = url.searchParams.get('code');
    if (!code) throw new Error('인가 코드가 없습니다.');

    const redirectUri = redirectUriFor(req);
    const tokenData = await exchangeCodeForToken(code, redirectUri);
    const profile = await fetchKakaoProfile(tokenData.access_token);

    if (db.isDbConfigured()) {
      await db.upsertUser(profile.id, profile.nickname);
    }

    const sessionToken = signSession(profile.id);
    res.writeHead(302, {
      Location: '/',
      'Set-Cookie': `session=${encodeURIComponent(sessionToken)}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 90}; SameSite=Lax`,
    });
    res.end();
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('카카오 로그인 실패: ' + err.message);
  }
}

function handlePublicConfig(req, res) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ tossClientKey: process.env.TOSS_CLIENT_KEY || null }));
}

function handlePaymentConfirm(req, res) {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    try {
      const { paymentKey, orderId, amount } = JSON.parse(body);
      if (!paymentKey || !orderId || !amount) throw new Error('결제 정보가 올바르지 않습니다.');
      const result = await confirmPayment(paymentKey, orderId, Number(amount));

      const userId = db.isDbConfigured() ? getSessionUserId(req) : null;
      if (userId) await db.addBonusCredit(userId);

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, status: result.status }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

function handleLogout(req, res) {
  res.writeHead(302, {
    Location: '/',
    'Set-Cookie': 'session=; HttpOnly; Path=/; Max-Age=0',
  });
  res.end();
}

const server = http.createServer((req, res) => {
  const reqUrl = req.url.split('?')[0];

  if (req.method === 'POST' && reqUrl === '/api/analyze') return handleAnalyze(req, res);
  if (req.method === 'GET' && reqUrl === '/api/reviews') return handleGetReviews(req, res);
  if (req.method === 'POST' && reqUrl === '/api/visit') return handleVisit(req, res);
  if (req.method === 'POST' && reqUrl === '/api/reviews') return handlePostReview(req, res);
  if (req.method === 'GET' && reqUrl === '/api/auth/me') return handleAuthMe(req, res);
  if (req.method === 'GET' && reqUrl === '/api/auth/kakao/login') return handleKakaoLogin(req, res);
  if (req.method === 'GET' && reqUrl === '/api/auth/kakao/callback') return handleKakaoCallback(req, res);
  if (req.method === 'POST' && reqUrl === '/api/auth/logout') return handleLogout(req, res);
  if (req.method === 'GET' && reqUrl === '/api/config') return handlePublicConfig(req, res);
  if (req.method === 'POST' && reqUrl === '/api/payments/confirm') return handlePaymentConfirm(req, res);

  let reqPath = decodeURIComponent(reqUrl);
  if (reqPath === '/') reqPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, reqPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`SERVER_ONLINE:${PORT}`);
  console.log(process.env.ANTHROPIC_API_KEY ? 'AI 비전 분석 모드 (ANTHROPIC_API_KEY 감지됨)' : '경고: API 키 없음 - 분석 요청시 503 반환됨');
  console.log(db.isDbConfigured() ? 'Supabase DB 연결됨' : '경고: Supabase 미설정 - 로컬 파일/쿠키로 폴백');
  console.log(process.env.KAKAO_REST_API_KEY ? '카카오 로그인 활성화됨' : '카카오 로그인 미설정');
});
