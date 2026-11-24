const FREE_TRIAL_KEY = 'faceReadingFreeTrialUsed';
const BONUS_CREDIT_KEY = 'faceReadingBonusCredits';

const state = { mode: 'self', base64: null, mediaType: null, basicResult: null, unlockedViaShare: false, selectedStars: 0 };

const steps = ['upload', 'loading', 'error', 'free', 'paid'];
function showStep(name) {
  for (const s of steps) {
    document.getElementById(`step-${s}`).classList.toggle('active', s === name);
  }
  document.getElementById('unlock-bar').style.display = name === 'free' ? 'block' : 'none';
}

function isFirstEverUse() {
  return localStorage.getItem(FREE_TRIAL_KEY) !== 'true';
}

function getBonusCredits() {
  return parseInt(localStorage.getItem(BONUS_CREDIT_KEY) || '0', 10);
}
function useBonusCredit() {
  const n = getBonusCredits();
  if (n > 0) localStorage.setItem(BONUS_CREDIT_KEY, String(n - 1));
}
function addBonusCredit() {
  localStorage.setItem(BONUS_CREDIT_KEY, String(getBonusCredits() + 1));
}

// ---- 사회적 증거(실제 리뷰) ----
async function loadSocialProof() {
  try {
    const res = await fetch('/api/reviews');
    const data = await res.json();
    const el = document.getElementById('social-proof');
    if (data.count === 0) {
      el.textContent = '아직 리뷰가 없어요 — 첫 리뷰어가 되어주세요! 🙋';
    } else {
      el.textContent = `⭐ ${data.avgRating} (${data.count}명 참여) · 실제 이용자 리뷰 기반`;
    }
  } catch (e) {
    // 조용히 무시
  }
}
loadSocialProof();

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

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64: state.base64, mediaType: state.mediaType, mode: state.mode }),
    });
    const data = await res.json();

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

    if (isFirstEverUse()) {
      localStorage.setItem(FREE_TRIAL_KEY, 'true');
      renderFreeResult(data, { showDailyNuance: false });
      renderPaidResult(data);
      showStep('paid');
    } else if (getBonusCredits() > 0) {
      useBonusCredit();
      state.unlockedViaShare = true;
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

function renderFreeResult(data, { showDailyNuance }) {
  document.getElementById('result-photo').src = data.photo;
  const badge = document.getElementById('result-badge');
  badge.textContent = `족집개 감정 결과: ${data.category}`;
  badge.style.background = data.color;
  document.getElementById('feat-eyes').textContent = data.features.eyes;
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

document.getElementById('btn-unlock').addEventListener('click', () => {
  renderPaidResult(state.basicResult);
  showStep('paid');
});

document.getElementById('btn-share').addEventListener('click', async () => {
  const shareText = `나 오늘 관상 봤는데 "${state.basicResult.category}"래! 족집개가 봐주는 동물상 관상, 너도 한번 해봐 👉`;
  const shareUrl = location.origin;

  try {
    if (navigator.share) {
      await navigator.share({ title: '족집개 - 오늘의 동물상 관상', text: shareText, url: shareUrl });
    } else {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      alert('공유 문구가 클립보드에 복사됐어요! 카카오톡에 붙여넣어 친구에게 공유해보세요 📋');
    }
    state.unlockedViaShare = true;
    renderPaidResult(state.basicResult);
    showStep('paid');
  } catch (err) {
    // 사용자가 공유를 취소한 경우는 조용히 무시
  }
});

function renderPaidResult(data) {
  document.getElementById('paid-source-badge').textContent = state.unlockedViaShare
    ? '📤 공유/리뷰로 무료 열람'
    : data.source === 'ai'
    ? 'AI 관상 분석 · 데모 무료 공개'
    : '데모 무료 공개';

  document.getElementById('result-photo-full').src = data.photo;
  const badgeFull = document.getElementById('result-badge-full');
  badgeFull.textContent = `족집개 감정 결과: ${data.category}`;
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
    await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ rating: state.selectedStars, comment }),
    });
    addBonusCredit();
    document.getElementById('review-submitted-msg').style.display = 'block';
    document.getElementById('btn-review-submit').disabled = true;
    loadSocialProof();
  } catch (err) {
    alert('리뷰 등록 중 오류가 발생했어요.');
  }
});
