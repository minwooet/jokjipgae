const FREE_TRIAL_KEY = 'faceReadingFreeTrialUsed';

const state = { mode: 'self', base64: null, mediaType: null, basicResult: null, unlockedViaShare: false, paidByToss: false, selectedStars: 0 };

const steps = ['login', 'upload', 'loading', 'error', 'free', 'paid'];
function showStep(name) {
  for (const s of steps) {
    document.getElementById(`step-${s}`).classList.toggle('active', s === name);
  }
  document.getElementById('unlock-bar').style.display = name === 'free' ? 'block' : 'none';
}

function isFirstEverUse() {
  return localStorage.getItem(FREE_TRIAL_KEY) !== 'true';
}

// ---- 사회적 증거(실제 리뷰 + 방문자 수) ----
async function loadSocialProof() {
  try {
    const res = await fetch('/api/reviews');
    const data = await res.json();
    const el = document.getElementById('social-proof');
    const visitText = `👀 누적 방문 ${data.visits ?? 0}명`;
    if (data.count === 0) {
      el.textContent = `${visitText} · 아직 리뷰가 없어요, 첫 리뷰어가 되어주세요! 🙋`;
    } else {
      el.textContent = `${visitText} · ⭐ ${data.avgRating} (${data.count}명 참여)`;
    }
    spawnFlyingReviews(data.recent || []);
  } catch (e) {
    // 조용히 무시
  }
}
loadSocialProof();
fetch('/api/visit', { method: 'POST' }).catch(() => {});

const FLY_MAX_VISIBLE = 3;
const FLY_ROTATE_INTERVAL_MS = 12000;
let flyRotateTimer = null;
let flyReviewPool = [];

function spawnFlyingReviews(recent) {
  flyReviewPool = recent;
  clearInterval(flyRotateTimer);
  if (!recent.length) {
    document.getElementById('review-fly-layer').innerHTML = '';
    return;
  }
  renderFlyingBatch();
  flyRotateTimer = setInterval(renderFlyingBatch, FLY_ROTATE_INTERVAL_MS);
}

// 네 방향 대각선: [시작 top%, 시작 left%, 끝 top%, 끝 left%]
const FLY_DIRECTIONS = [
  [-15, -70, 115, 100],
  [-15, 100, 115, -70],
  [115, -70, -15, 100],
  [115, 100, -15, -70],
];

function renderFlyingBatch() {
  const layer = document.getElementById('review-fly-layer');
  layer.innerHTML = '';
  const shuffled = [...flyReviewPool].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(FLY_MAX_VISIBLE, shuffled.length));

  picked.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'review-fly-item';
    const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
    el.textContent = `${stars} ${r.comment || ''}`.trim();

    const [startTop, startLeft, endTop, endLeft] = FLY_DIRECTIONS[Math.floor(Math.random() * FLY_DIRECTIONS.length)];
    const rotate = Math.random() > 0.5 ? -12 : 12;
    el.style.opacity = '0';
    layer.appendChild(el);

    el.animate(
      [
        { top: `${startTop}%`, left: `${startLeft}%`, transform: `rotate(${rotate}deg)`, opacity: 0 },
        { offset: 0.08, opacity: 0.5 },
        { offset: 0.92, opacity: 0.5 },
        { top: `${endTop}%`, left: `${endLeft}%`, transform: `rotate(${rotate}deg)`, opacity: 0 },
      ],
      { duration: 28000, delay: i * 3500, easing: 'linear', iterations: Infinity }
    );
  });
}

// ---- 로그인 상태 ----
let authState = { loggedIn: false };
async function loadAuthState() {
  try {
    const res = await fetch('/api/auth/me');
    authState = await res.json();
    const loginBtn = document.getElementById('btn-kakao-login');
    const userChip = document.getElementById('user-chip');
    if (authState.loggedIn) {
      loginBtn.style.display = 'none';
      userChip.style.display = 'inline-block';
      userChip.textContent = `👋 ${authState.nickname || '회원'}님 (로그아웃)`;
      if (document.getElementById('step-login').classList.contains('active')) showStep('upload');
      const shareBtn = document.getElementById('btn-share');
      if (authState.shareBonusUsed) {
        shareBtn.disabled = true;
        shareBtn.textContent = '📤 공유 보너스 이미 받음';
      }
    } else {
      loginBtn.style.display = 'inline-block';
      userChip.style.display = 'none';
      showStep('login');
    }
  } catch (e) {
    // 조용히 무시
  }
}
loadAuthState();

document.getElementById('user-chip').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.reload();
});

// ---- 모드 토글 ----
const modeSelfBtn = document.getElementById('mode-self');
const modeOtherBtn = document.getElementById('mode-other');
const otherNotice = document.getElementById('other-notice');

modeSelfBtn.addEventListener('click', () => {
  state.mode = 'self';
  modeSelfBtn.classList.add('active');
  modeOtherBtn.classList.remove('active');
  otherNotice.style.display = 'none';
});
modeOtherBtn.addEventListener('click', () => {
  state.mode = 'other';
  modeOtherBtn.classList.add('active');
  modeSelfBtn.classList.remove('active');
  otherNotice.style.display = 'block';
});

// ---- 파일 업로드 ----
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const previewImg = document.getElementById('preview-img');
const analyzeBtn = document.getElementById('btn-analyze');

dropZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const [header, base64] = dataUrl.split(',');
    state.base64 = base64;
    state.mediaType = header.match(/data:(.*);base64/)?.[1] || 'image/jpeg';
    previewImg.src = dataUrl;
    previewImg.style.display = 'block';
    analyzeBtn.disabled = false;
  };
  reader.readAsDataURL(file);
});

analyzeBtn.addEventListener('click', runAnalysis);

async function runAnalysis() {
  if (!state.base64) return;
  showStep('loading');

  const clientIsFirstUse = isFirstEverUse();

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        imageBase64: state.base64,
        mediaType: state.mediaType,
        mode: state.mode,
        clientIsFirstUse,
      }),
    });
    const data = await res.json();

    if (data.error === 'LOGIN_REQUIRED') {
      showStep('login');
      return;
    }
    if (data.error) {
      showError(data.error);
      return;
    }
    if (data.faceDetected === false) {
      showError(`😢 ${data.reason}\n정면이 잘 보이는 얼굴 사진으로 다시 시도해주세요.`);
      return;
    }

    state.basicResult = data;
    state.unlockedViaShare = false;
    state.paidByToss = false;

    if (data.unlockLevel === 'full') {
      if (!authState.loggedIn && clientIsFirstUse) localStorage.setItem(FREE_TRIAL_KEY, 'true');
      state.unlockedViaShare = authState.loggedIn && !clientIsFirstUse;
      renderFreeResult(data, { showDailyNuance: false });
      renderPaidResult(data);
      showStep('paid');
    } else {
      renderFreeResult(data, { showDailyNuance: true });
      showStep('free');
    }
  } catch (err) {
    showError('분석 중 오류가 발생했어요: ' + err.message);
  }
}

function showError(message) {
  document.getElementById('error-message').textContent = message;
  showStep('error');
}

document.getElementById('btn-error-retry').addEventListener('click', () => {
  showStep('upload');
});

function truncateTease(text, ratio = 0.5) {
  if (!text) return text;
  const cut = Math.max(10, Math.floor(text.length * ratio));
  return text.slice(0, cut).trim() + '... 🔒';
}

function renderFreeResult(data, { showDailyNuance }) {
  document.getElementById('result-photo').src = data.photo;
  const badge = document.getElementById('result-badge');
  badge.textContent = `관상봐주시개 감정 결과: ${data.category}`;
  badge.style.background = data.color;
  document.getElementById('feat-eyes').textContent = truncateTease(data.features.eyes);
  document.getElementById('feat-eyebrows').textContent = data.features.eyebrows;
  document.getElementById('feat-expression').textContent = data.features.expression;
  document.getElementById('emotional-message').textContent = data.emotionalMessage || '';

  const nuanceBox = document.getElementById('daily-nuance');
  if (showDailyNuance && data.dailyNuance) {
    nuanceBox.textContent = `🔮 ${data.dailyNuance}`;
    nuanceBox.style.display = 'block';
  } else {
    nuanceBox.style.display = 'none';
  }

  const photo = document.getElementById('result-photo');
  photo.classList.remove('reveal-photo');
  void photo.offsetWidth;
  photo.classList.add('reveal-photo');
}

const PENDING_PAYMENT_KEY = 'faceReadingPendingPayment';
const PAYMENT_AMOUNT = 490;
let tossClientKey = null;
fetch('/api/config')
  .then((r) => r.json())
  .then((d) => {
    tossClientKey = d.tossClientKey;
    if (d.kakaoJsKey && window.Kakao && !Kakao.isInitialized()) {
      Kakao.init(d.kakaoJsKey);
    }
  })
  .catch(() => {});

document.getElementById('btn-unlock').addEventListener('click', () => {
  if (!tossClientKey || !window.TossPayments) {
    alert('결제 기능이 아직 설정되지 않았어요.');
    return;
  }
  const orderId = `order_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  localStorage.setItem(PENDING_PAYMENT_KEY, JSON.stringify({ orderId, result: state.basicResult }));

  const tossPayments = TossPayments(tossClientKey);
  tossPayments.requestPayment('카드', {
    amount: PAYMENT_AMOUNT,
    orderId,
    orderName: `관상봐주시개 심화 리포트 (${state.basicResult.category})`,
    successUrl: `${location.origin}/`,
    failUrl: `${location.origin}/`,
  });
});

async function checkPendingPaymentReturn() {
  const params = new URLSearchParams(location.search);
  const paymentKey = params.get('paymentKey');
  const orderId = params.get('orderId');
  const amount = params.get('amount');
  const failCode = params.get('code');

  if (failCode) {
    history.replaceState({}, '', location.pathname);
    alert('결제가 취소되었거나 실패했어요: ' + (params.get('message') || failCode));
    return;
  }
  if (!paymentKey || !orderId || !amount) return;

  history.replaceState({}, '', location.pathname);
  const pendingRaw = localStorage.getItem(PENDING_PAYMENT_KEY);
  const pending = pendingRaw ? JSON.parse(pendingRaw) : null;

  try {
    const res = await fetch('/api/payments/confirm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    if (pending && pending.orderId === orderId) {
      state.basicResult = pending.result;
      state.unlockedViaShare = false;
      state.paidByToss = true;
      renderPaidResult(state.basicResult);
      showStep('paid');
    } else {
      alert('결제는 완료됐지만 리포트 데이터를 못 찾았어요. 다시 분석해주세요.');
    }
    localStorage.removeItem(PENDING_PAYMENT_KEY);
  } catch (err) {
    alert('결제 승인 중 오류가 발생했어요: ' + err.message);
  }
}
checkPendingPaymentReturn();

document.getElementById('btn-share').addEventListener('click', async () => {
  if (!authState.loggedIn) {
    showStep('login');
    return;
  }
  if (authState.shareBonusUsed) {
    alert('공유 보너스는 계정당 한 번만 받을 수 있어요. 이미 사용하셨어요!');
    return;
  }

  const shareUrl = location.origin;
  if (window.Kakao && Kakao.isInitialized()) {
    Kakao.Share.sendDefault({
      objectType: 'feed',
      content: {
        title: `나 오늘 관상 봤는데 "${state.basicResult.category}"래!`,
        description: '관상봐주시개가 봐주는 오늘의 동물상 관상, 너도 한번 해봐',
        imageUrl: `${location.origin}/${state.basicResult.photo}`,
        link: { webUrl: shareUrl, mobileWebUrl: shareUrl },
      },
      buttons: [{ title: '나도 관상보기', link: { webUrl: shareUrl, mobileWebUrl: shareUrl } }],
    });
  } else {
    await navigator.clipboard.writeText(`나 오늘 관상 봤는데 "${state.basicResult.category}"래! ${shareUrl}`);
    alert('공유 문구가 클립보드에 복사됐어요!');
  }

  try {
    const res = await fetch('/api/share-bonus', { method: 'POST' });
    const data = await res.json();
    if (data.granted) {
      authState.shareBonusUsed = true;
      state.unlockedViaShare = true;
      renderPaidResult(state.basicResult);
      showStep('paid');
    } else {
      alert('공유 보너스는 이미 받으셨어요.');
    }
  } catch (err) {
    alert('공유 보너스 처리 중 오류가 발생했어요.');
  }
});

function renderPaidResult(data) {
  document.getElementById('paid-source-badge').textContent = state.paidByToss
    ? '💳 490원 결제 완료'
    : state.unlockedViaShare
    ? '📤 공유 보너스로 무료 열람'
    : data.source === 'ai'
    ? 'AI 관상 분석 · 데모 무료 공개'
    : '데모 무료 공개';

  document.getElementById('result-photo-full').src = data.photo;
  const badgeFull = document.getElementById('result-badge-full');
  badgeFull.textContent = `관상봐주시개 감정 결과: ${data.category}`;
  badgeFull.style.background = data.color;
  document.getElementById('feat-eyes-full').textContent = data.features.eyes;
  document.getElementById('feat-eyebrows-full').textContent = data.features.eyebrows;
  document.getElementById('feat-expression-full').textContent = data.features.expression;
  document.getElementById('emotional-message-full').textContent = data.emotionalMessage || '';

  document.getElementById('feat-nose').textContent = data.features.nose;
  document.getElementById('feat-mouth').textContent = data.features.mouth;
  document.getElementById('feat-ears').textContent = data.features.ears;
  document.getElementById('feat-foreheadjaw').textContent = data.features.foreheadAndJaw;
  document.getElementById('result-overall').textContent = data.overallImpression;
  document.getElementById('result-strengths').textContent = data.strengths;
  document.getElementById('result-cautions').textContent = data.cautions;
  document.getElementById('result-love').textContent = data.love;
  document.getElementById('result-work').textContent = data.work;
  document.getElementById('result-lucky').textContent = data.luckyItem;
  document.getElementById('result-compat').textContent = data.compatibleWith;
  document.getElementById('compat-photo').src = data.compatiblePhoto;
}

document.getElementById('btn-restart').addEventListener('click', resetFlow);

function resetFlow() {
  state.base64 = null;
  state.mediaType = null;
  state.basicResult = null;
  state.unlockedViaShare = false;
  state.paidByToss = false;
  previewImg.style.display = 'none';
  previewImg.src = '';
  fileInput.value = '';
  analyzeBtn.disabled = true;

  state.selectedStars = 0;
  starEls.forEach((s) => s.classList.remove('filled'));
  document.getElementById('review-text').value = '';
  document.getElementById('review-submitted-msg').style.display = 'none';
  document.getElementById('btn-review-submit').disabled = false;

  showStep('upload');
  document.getElementById('tool').scrollIntoView({ behavior: 'smooth' });
}

// ---- 리뷰 남기고 보너스 받기 ----
const starEls = document.querySelectorAll('#star-rating span');
starEls.forEach((el) => {
  el.addEventListener('click', () => {
    state.selectedStars = parseInt(el.dataset.v, 10);
    starEls.forEach((s) => s.classList.toggle('filled', parseInt(s.dataset.v, 10) <= state.selectedStars));
  });
});

document.getElementById('btn-review-submit').addEventListener('click', async () => {
  if (state.selectedStars === 0) {
    alert('별점을 먼저 선택해주세요!');
    return;
  }
  const comment = document.getElementById('review-text').value.trim();
  try {
    const res = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: state.selectedStars, comment }),
    });
    await res.json();
    document.getElementById('review-submitted-msg').style.display = 'block';
    document.getElementById('btn-review-submit').disabled = true;
    loadSocialProof();
  } catch (err) {
    alert('리뷰 등록 중 오류가 발생했어요.');
  }
});
