import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildAiPrompt, findCategory, CATEGORIES, getDailyNuance } from './analysis.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const REVIEWS_FILE = path.join(__dirname, 'reviews.json');
const PORT = process.env.PORT || 3002;

function readReviews() {
  if (!fs.existsSync(REVIEWS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(REVIEWS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeReviews(reviews) {
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
      const { imageBase64, mediaType, mode } = input;
      if (!imageBase64) throw new Error('이미지가 없습니다.');

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

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        faceDetected: true,
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

function handleGetReviews(req, res) {
  const reviews = readReviews();
  const count = reviews.length;
  const avgRating = count ? reviews.reduce((sum, r) => sum + r.rating, 0) / count : 0;
  const recent = reviews.slice(-6).reverse().map((r) => ({ rating: r.rating, comment: r.comment }));
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ count, avgRating: Math.round(avgRating * 10) / 10, recent }));
}

function handlePostReview(req, res) {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    try {
      const { rating, comment } = JSON.parse(body);
      const r = Math.round(Number(rating));
      if (!(r >= 1 && r <= 5)) throw new Error('별점은 1~5 사이여야 해요.');
      const reviews = readReviews();
      reviews.push({ rating: r, comment: String(comment || '').slice(0, 300), createdAt: new Date().toISOString() });
      writeReviews(reviews);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api/analyze') {
    handleAnalyze(req, res);
    return;
  }
  if (req.method === 'GET' && req.url === '/api/reviews') {
    handleGetReviews(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/api/reviews') {
    handlePostReview(req, res);
    return;
  }

  let reqPath = decodeURIComponent(req.url.split('?')[0]);
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
});
