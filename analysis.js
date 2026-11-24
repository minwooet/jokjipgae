export const CATEGORIES = [
  { id: 'dog', name: '강아지상', emoji: '🐶', color: '#f7b267', photo: 'images/mascot/dog.jpg' },
  { id: 'cat', name: '고양이상', emoji: '🐱', color: '#8e6bff', photo: 'images/mascot/cat.jpg' },
  { id: 'fox', name: '여우상', emoji: '🦊', color: '#ff8fa3', photo: 'images/mascot/fox.jpg' },
  { id: 'rabbit', name: '토끼상', emoji: '🐰', color: '#ffd6e8', photo: 'images/mascot/rabbit.jpg' },
  { id: 'deer', name: '사슴상', emoji: '🦌', color: '#c9a66b', photo: 'images/mascot/deer.jpg' },
  { id: 'bear', name: '곰상', emoji: '🐻', color: '#a97155', photo: 'images/mascot/bear.jpg' },
  { id: 'tiger', name: '호랑이상', emoji: '🐯', color: '#ff6b4a', photo: 'images/mascot/tiger.jpg' },
  { id: 'sheep', name: '양상', emoji: '🐑', color: '#f1e9db', photo: 'images/mascot/sheep.jpg' },
  { id: 'squirrel', name: '다람쥐상', emoji: '🐿️', color: '#d98324', photo: 'images/mascot/squirrel.jpg' },
  { id: 'snake', name: '뱀상', emoji: '🐍', color: '#5c6b73', photo: 'images/mascot/snake.jpg' },
  { id: 'raccoon', name: '너구리상', emoji: '🦝', color: '#8c7355', photo: 'images/mascot/raccoon.jpg' },
  { id: 'otter', name: '수달상', emoji: '🦦', color: '#6b4f3a', photo: 'images/mascot/otter.jpg' },
  { id: 'koala', name: '코알라상', emoji: '🐨', color: '#9a9a8c', photo: 'images/mascot/koala.jpg' },
  { id: 'panda', name: '판다상', emoji: '🐼', color: '#2d2a32', photo: 'images/mascot/panda.jpg' },
  { id: 'hamster', name: '햄스터상', emoji: '🐹', color: '#e8a33d', photo: 'images/mascot/hamster.jpg' },
  { id: 'horse', name: '말상', emoji: '🐴', color: '#7a5230', photo: 'images/mascot/horse.jpg' },
  { id: 'wolf', name: '늑대상', emoji: '🐺', color: '#4a4a52', photo: 'images/mascot/wolf.jpg' },
  { id: 'owl', name: '부엉이상', emoji: '🦉', color: '#b08968', photo: 'images/mascot/owl.jpg' },
  { id: 'monkey', name: '원숭이상', emoji: '🐵', color: '#c68b59', photo: 'images/mascot/monkey.jpg' },
  { id: 'lion', name: '사자상', emoji: '🦁', color: '#e3a857', photo: 'images/mascot/lion.jpg' },
  { id: 'mole', name: '두더지상', emoji: '🦔', color: '#5a5a5a', photo: 'images/mascot/mole.jpg' },
  { id: 'hedgehog', name: '고슴도치상', emoji: '🦔', color: '#8a7250', photo: 'images/mascot/hedgehog.jpg' },
  { id: 'meerkat', name: '미어캣상', emoji: '🐾', color: '#c9a876', photo: 'images/mascot/meerkat.jpg' },
  { id: 'capybara', name: '카피바라상', emoji: '🐹', color: '#b5a088', photo: 'images/mascot/capybara.jpg' },
];

export const DAILY_NUANCE = [
  '오늘은 {cat} 매력이 유독 빛나는 날이에요. 주변에서 먼저 말 걸어올 확률 UP!',
  '오늘의 기운: {cat}력 상승 중! 평소보다 호감도가 더 잘 전달되는 날이에요.',
  '오늘따라 {cat} 분위기가 짙게 느껴지는 하루예요. 중요한 약속이 있다면 잘 풀릴 조짐!',
  '복동이가 보기엔, 오늘은 {cat}다운 매력 포인트가 한층 살아나는 타이밍이에요.',
  '오늘의 관상 기운: {cat} 특유의 매력이 최고조! 사진을 다시 올려서 오늘 변화를 확인해보세요.',
  '어제와는 다른 기운이 느껴져요. 오늘은 {cat}의 숨은 매력이 드러나는 날!',
  '오늘 하루, {cat} 특유의 분위기가 주변 사람들 눈에 유독 잘 띌 것 같아요.',
  '복동이 예감: 오늘은 {cat} 운세가 미묘하게 달라지는 날. 심화 리포트에서 확인해보세요.',
];

export function getDailyNuance(categoryName) {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const idx = (dayOfYear + categoryName.length) % DAILY_NUANCE.length;
  return DAILY_NUANCE[idx].replace(/\{cat\}/g, categoryName);
}

export function findCategory(name) {
  return CATEGORIES.find((c) => c.name === name);
}

export function buildAiPrompt(mode) {
  const subjectNote =
    mode === 'other'
      ? '이 사진은 사용자가 궁금해하는 다른 사람의 얼굴일 수 있습니다. 당사자가 이 결과를 직접 볼 수도 있다는 걸 감안하세요.'
      : '이 사진은 사용자 본인의 얼굴일 수 있습니다.';

  const categoryList = CATEGORIES.map((c) => c.name).join(', ');

  return `너는 30년 경력의 관상 전문가처럼 아주 상세하고 진지하게, 그러나 사람에게 상처 주지 않게 읽어주는 "복동이 관상소"의 캐릭터야.

[1단계: 얼굴 검증]
가장 먼저, 이 이미지에 실제 사람의 얼굴이 명확하게 나와 있는지 판단해.
- 얼굴이 없거나, 가려져서 눈·코·입을 알아볼 수 없거나, 그림/캐릭터/동물/사물 사진이면 faceDetected를 false로 설정하고 이유를 reason에 적어. 이 경우 다른 필드는 비워도 돼.
- 명확한 사람 얼굴이 보일 때만 faceDetected를 true로 하고 2단계를 진행해.

[2단계: 상세 관상 분석] (faceDetected가 true일 때만)
${subjectNote}
실제 관상가가 상담해주는 것처럼, 눈/눈썹/표정/코/입/귀/이마와 턱선을 각각 구체적으로 묘사하고 그것이 암시하는 성향을 설명해.
각 항목은 반드시 장점과 더불어 가볍게 보완하면 좋을 점(단점)도 함께 언급해. 단, 외모를 직접 평가("예쁘다/못생겼다", 나이, 체중, 인종)하지 말고, 모양이나 분위기를 바탕으로 "성향·기질" 위주로 해석해. 단점도 비난처럼 들리지 않게, 조언하듯 부드럽게 표현해.
각 항목은 3문장 이상으로 충분히 길고 구체적으로 써.

**중요 - 가려진 부위 처리**: 머리카락, 앞머리, 안경, 마스크, 각도 등으로 인해 특정 부위(특히 눈썹)가 명확히 보이지 않으면, 절대 지어내지 말고 "앞머리에 가려져 눈썹을 정확히 확인하기 어려워요" 처럼 솔직하게 안 보인다는 사실을 해당 항목에 그대로 적어. 보이는 부분이 조금이라도 있으면 그 부분만으로 조심스럽게 유추하되, 안 보인다는 점을 먼저 명시해.

**표정 분석(expression)은 특별 취급**: 이건 고정된 이목구비가 아니라 "지금, 오늘" 사진 속 그 순간의 표정과 분위기를 읽는 항목이야. 입꼬리, 눈빛, 미간, 전체적인 기색을 보고 지금 이 사람이 어떤 감정/기분 상태에 가까워 보이는지 섬세하게 묘사해(예: 편안함, 약간의 피로, 설렘, 담담함 등). 그리고 그 표정에서 느껴지는 감정선을 바탕으로, 사람의 마음을 울리거나 위로가 되는 짧고 진심 어린 한 문장을 emotionalMessage에 따로 적어. 이건 분석이 아니라 오늘 이 사람에게 건네는 다정한 말 한마디여야 해.

마지막에 전체 인상을 종합해서 아래 동물상 중 하나로 분류해: ${categoryList}

다음 JSON 형식으로만 응답해. 다른 설명 없이 JSON만 출력해:
{
  "faceDetected": true 또는 false,
  "reason": "faceDetected가 false일 때만: 왜 인식이 안 되는지 짧게",
  "category": "동물상 이름 (목록 중 하나)",
  "features": {
    "eyes": "눈 분석 3문장 이상, 장점+보완점",
    "eyebrows": "눈썹 분석 3문장 이상, 장점+보완점 (가려져 있으면 그 사실을 먼저 밝힐 것)",
    "expression": "오늘 이 사진 속 표정/분위기 분석 3문장 이상",
    "nose": "코 분석 3문장 이상, 장점+보완점",
    "mouth": "입 분석 3문장 이상, 장점+보완점",
    "ears": "귀 분석 3문장 이상, 장점+보완점",
    "foreheadAndJaw": "이마와 턱선 분석 3문장 이상, 장점+보완점"
  },
  "emotionalMessage": "표정에서 느껴지는 감정을 바탕으로 마음을 울리는 다정한 한 문장",
  "overallImpression": "전체 인상을 종합한 4문장 이상의 긴 총평",
  "strengths": "핵심 장점 요약 2문장",
  "cautions": "보완하면 좋은 점 요약 2문장 (부드러운 조언 톤)",
  "love": "연애 스타일 2~3문장",
  "work": "직장/사회생활 스타일 2~3문장",
  "luckyItem": "오늘의 럭키 아이템 (짧게)",
  "compatibleWith": "궁합이 좋은 동물상 이름 (목록 중 하나, category와 다른 것)"
}`;
}
