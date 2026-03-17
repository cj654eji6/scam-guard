<script setup lang="ts">
import liff from '@line/liff'

interface AnalysisResult {
  riskLevel: 'high' | 'medium' | 'low' | 'safe'
  riskScore: number
  summary: string
  scamType: string
  indicators: string[]
  analysis: string
  advice: string
}

const inputText = ref('')
const imageData = ref<string | null>(null)
const imageType = ref('image/png')
const isLoading = ref(false)
const result = ref<AnalysisResult | null>(null)
const loadingText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const uploadError = ref('')

const MAX_IMAGE_SIZE = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']

const loadingTexts = [
  '正在比對詐騙話術資料庫...',
  '分析語意特徵...',
  '評估風險等級...',
  '生成鑑定報告...',
]

// 風險等級對應
const riskLevel = computed(() => {
  if (!result.value) return 'safe'
  const score = result.value.riskScore
  if (score <= 30) return 'safe'
  if (score <= 70) return 'warn'
  return 'danger'
})

const verdictText = computed(() => {
  if (!result.value) return ''
  const level = riskLevel.value
  if (level === 'safe') return '✓ 低風險'
  if (level === 'warn') return '⚡ 請謹慎確認'
  return '⚠️ 高度疑似詐騙'
})

// 關鍵詞標記原文
const highlightedText = computed(() => {
  if (!result.value || !inputText.value) return ''
  let text = inputText.value
  for (const kw of result.value.indicators) {
    text = text.replace(
      new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      `<span class="highlight-word">${kw}</span>`,
    )
  }
  return text
})

function handleUpload(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    uploadError.value = '格式不支援，請上傳 JPG、PNG、GIF、WebP 或 HEIC 圖片。'
    if (fileInput.value) fileInput.value.value = ''
    return
  }

  if (file.size > MAX_IMAGE_SIZE) {
    uploadError.value = `圖片過大（${(file.size / 1024 / 1024).toFixed(1)} MB），請上傳 5 MB 以下的圖片。`
    if (fileInput.value) fileInput.value.value = ''
    return
  }

  uploadError.value = ''
  imageType.value = file.type || 'image/png'
  const reader = new FileReader()
  reader.onload = (e) => {
    const dataUrl = e.target?.result as string
    imageData.value = dataUrl.split(',')[1] ?? null
    if (!inputText.value) {
      inputText.value = `[截圖已上傳] ${file.name}`
    }
  }
  reader.readAsDataURL(file)
}

async function analyze() {
  if (!inputText.value.trim() && !imageData.value) return
  if (isLoading.value) return

  isLoading.value = true
  result.value = null

  // Loading 動畫文字
  let i = 0
  const interval = setInterval(() => {
    loadingText.value = loadingTexts[i % loadingTexts.length] ?? ''
    i++
  }, 700)

  try {
    const body: Record<string, string> = {}
    const cleanText = inputText.value.replace(/^\[截圖已上傳\].*\n?/, '').trim()
    if (cleanText) body.text = cleanText
    if (imageData.value) {
      body.image = imageData.value
      body.imageType = imageType.value
    }

    const res = await $fetch<AnalysisResult>('/api/analyze', {
      method: 'POST',
      body,
    })
    result.value = res
  } catch {
    result.value = {
      riskLevel: 'medium',
      riskScore: 50,
      summary: '分析失敗，請稍後再試',
      scamType: '未知',
      indicators: [],
      analysis: '伺服器暫時無法回應，請稍後重試。',
      advice: '如有疑慮，請撥打 165 反詐騙專線。',
    }
  } finally {
    clearInterval(interval)
    isLoading.value = false
  }
}

function shareResult() {
  if (!result.value) return
  const r = result.value
  const text = `🛡️ 詐騙鑑定結果\n\n風險分數：${r.riskScore}/100\n類型：${r.scamType}\n${r.summary}\n\n建議：${r.advice}\n\n🚨 詳情請見 165 反詐騙網站：https://165.npa.gov.tw`

  if (liff.isApiAvailable('shareTargetPicker')) {
    liff.shareTargetPicker([{ type: 'text', text }])
  } else if (navigator.share) {
    navigator.share({ title: '詐騙鑑定結果', text })
  } else {
    navigator.clipboard.writeText(text).then(() => {
      alert('鑑定結果已複製！請貼給親友查看。')
    })
  }
}

function resetAll() {
  inputText.value = ''
  imageData.value = null
  result.value = null
  uploadError.value = ''
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="header">
      <div class="logo">🛡️</div>
      <div class="header-text">
        <h1>詐騙鑑定器</h1>
        <p>SCAM DETECTOR v1.0</p>
      </div>
      <div class="header-badge">AI POWERED</div>
    </div>

    <!-- Input Section -->
    <div v-if="!isLoading && !result">
      <div class="input-card">
        <div class="input-label">貼上可疑訊息</div>
        <textarea
          v-model="inputText"
          placeholder="請貼上您收到的可疑訊息，例如：「恭喜您中獎了！點擊連結立即領取 NT$50,000 獎金…」"
        />
        <div class="divider">或</div>
        <button class="upload-btn" @click="fileInput?.click()">
          <span>📷</span> 上傳截圖
        </button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          hidden
          @change="handleUpload"
        >
      </div>

      <button
        class="analyze-btn"
        :disabled="!inputText.trim() && !imageData"
        @click="analyze"
      >
        開始鑑定
      </button>

      <div v-if="uploadError" class="error-banner">
        <span>⚠️</span>
        <span>{{ uploadError }}</span>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="loading">
      <div class="loading-title">AI 分析中</div>
      <div class="scan-line" />
      <p class="loading-text">{{ loadingText }}</p>
    </div>

    <!-- Result -->
    <div v-if="result && !isLoading" class="result fade-in">
      <div class="score-card" :class="riskLevel">
        <div class="score-label">SCAM RISK SCORE</div>
        <div class="score-number">{{ result.riskScore }}</div>
        <div class="score-verdict">{{ verdictText }}</div>
        <div class="risk-bar-wrap">
          <div class="risk-bar-track">
            <div class="risk-bar-needle" :style="{ left: result.riskScore + '%' }" />
          </div>
          <div class="risk-bar-segments">
            <div class="risk-seg safe" :class="{ active: riskLevel === 'safe' }">✓ 安全<br>0 – 30</div>
            <div class="risk-seg warn" :class="{ active: riskLevel === 'warn' }">⚡ 可疑<br>31 – 70</div>
            <div class="risk-seg danger" :class="{ active: riskLevel === 'danger' }">⚠ 高風險<br>71 – 100</div>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-card">
          <div class="detail-card-label">詐騙類型</div>
          <div class="detail-card-value">
            <span class="type-badge">{{ result.scamType }}</span>
          </div>
        </div>
        <div class="detail-card">
          <div class="detail-card-label">建議行動</div>
          <div class="suggestion-text">{{ result.advice }}</div>
        </div>
        <div class="detail-card full">
          <div class="detail-card-label">分析說明</div>
          <div class="suggestion-text">{{ result.analysis }}</div>
        </div>
        <div v-if="highlightedText" class="detail-card full">
          <div class="detail-card-label">原文標記（可疑話術）</div>
          <!-- eslint-disable vue/no-v-html -->
          <div class="highlighted-text" v-html="highlightedText" />
        </div>
        <div v-if="result.indicators.length" class="detail-card full">
          <div class="detail-card-label">可疑關鍵詞</div>
          <div class="keywords">
            <span v-for="kw in result.indicators" :key="kw" class="keyword-tag">{{ kw }}</span>
          </div>
        </div>
      </div>

      <div class="link-165" @click="navigateTo('https://165.npa.gov.tw', { external: true, open: { target: '_blank' } })">
        <div class="link-165-icon">🚨</div>
        <div class="link-165-text">
          <strong>165 全民防騙網</strong>
          <span>165.npa.gov.tw · 撥打 165 反詐騙專線</span>
        </div>
        <div class="link-165-arrow">→</div>
      </div>

      <button class="share-btn" @click="shareResult">
        <span>💬</span> 一鍵分享給 LINE 親友
      </button>

      <button class="reset-btn" @click="resetAll">重新鑑定</button>
    </div>
  </div>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 32px;
  padding-top: 8px;
}

.logo {
  width: 44px;
  height: 44px;
  background: linear-gradient(135deg, #FF4B4B, #FF8C42);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
  box-shadow: 0 0 20px rgba(255,75,75,0.4);
}

.header-text h1 {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: -0.5px;
  line-height: 1.1;
}

.header-text p {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--mono);
  margin-top: 2px;
}

.header-badge {
  margin-left: auto;
  background: rgba(59,130,246,0.12);
  border: 1px solid rgba(59,130,246,0.3);
  color: #60A5FA;
  font-size: 10px;
  font-family: var(--mono);
  padding: 4px 10px;
  border-radius: 20px;
  letter-spacing: 0.5px;
}

/* Input */
.input-card {
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 16px;
}

.input-label {
  font-size: 11px;
  font-family: var(--mono);
  color: var(--muted);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-label::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}

textarea {
  width: 100%;
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-family: var(--sans);
  font-size: 15px;
  line-height: 1.6;
  padding: 14px 16px;
  resize: none;
  min-height: 130px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

textarea::placeholder { color: var(--muted); }
textarea:focus {
  border-color: rgba(255,75,75,0.5);
  box-shadow: 0 0 0 3px rgba(255,75,75,0.08);
}

.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 12px 0;
  color: var(--muted);
  font-size: 11px;
  font-family: var(--mono);
}

.divider::before, .divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}

.upload-btn {
  width: 100%;
  background: var(--surface2);
  border: 1px dashed rgba(255,255,255,0.2);
  border-radius: 10px;
  color: var(--muted);
  font-family: var(--sans);
  font-size: 14px;
  padding: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
}

.upload-btn:hover {
  border-color: rgba(255,75,75,0.4);
  color: var(--text);
  background: rgba(255,75,75,0.05);
}

.error-banner {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.35);
  border-radius: 10px;
  padding: 12px 14px;
  margin-top: 12px;
  font-size: 13px;
  color: #FCA5A5;
  line-height: 1.5;
}

/* Analyze button */
.analyze-btn {
  width: 100%;
  background: linear-gradient(135deg, #FF4B4B, #FF8C42);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-family: var(--sans);
  font-weight: 700;
  font-size: 16px;
  padding: 16px;
  cursor: pointer;
  letter-spacing: 0.5px;
  transition: all 0.2s;
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
}

.analyze-btn::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.15));
}

.analyze-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(255,75,75,0.4); }
.analyze-btn:active { transform: translateY(0); }
.analyze-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }

/* Loading */
.loading {
  text-align: center;
  padding: 32px 20px;
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: 16px;
  margin-bottom: 16px;
}

.loading-title {
  font-size: 13px;
  font-family: var(--mono);
  color: var(--muted);
  margin-bottom: 8px;
}

.scan-line {
  width: 100%;
  height: 2px;
  background: linear-gradient(90deg, transparent, #FF4B4B, transparent);
  border-radius: 2px;
  margin: 16px 0;
  animation: scan 1.2s ease-in-out infinite;
}

@keyframes scan {
  0% { transform: scaleX(0); opacity: 0; }
  50% { transform: scaleX(1); opacity: 1; }
  100% { transform: scaleX(0); opacity: 0; }
}

.loading-text {
  font-size: 13px;
  font-family: var(--mono);
  color: var(--muted);
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* Score card */
.score-card {
  background: var(--surface);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 12px;
  text-align: center;
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border2);
}

.score-card::before {
  content: '';
  position: absolute;
  top: -40px;
  left: 50%;
  transform: translateX(-50%);
  width: 200px;
  height: 200px;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.2;
}

.score-card.safe::before { background: var(--safe); }
.score-card.warn::before { background: var(--warn); }
.score-card.danger::before { background: var(--danger); }

.score-label {
  font-size: 11px;
  font-family: var(--mono);
  color: var(--muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.score-number {
  font-size: 80px;
  font-weight: 900;
  line-height: 1;
  font-family: var(--mono);
  margin-bottom: 8px;
}

.score-card.safe .score-number { color: var(--safe); }
.score-card.warn .score-number { color: var(--warn); }
.score-card.danger .score-number { color: var(--danger); }

.score-verdict {
  font-size: 16px;
  font-weight: 700;
  padding: 6px 16px;
  border-radius: 20px;
  display: inline-block;
  margin-bottom: 4px;
}

.score-card.safe .score-verdict { background: rgba(34,197,94,0.15); color: var(--safe); }
.score-card.warn .score-verdict { background: rgba(245,158,11,0.15); color: var(--warn); }
.score-card.danger .score-verdict { background: rgba(239,68,68,0.15); color: var(--danger); }

/* Risk bar */
.risk-bar-wrap { margin-top: 18px; }
.risk-bar-track {
  position: relative;
  height: 10px;
  border-radius: 99px;
  background: linear-gradient(to right, #22C55E 0%, #22C55E 30%, #F59E0B 30%, #F59E0B 70%, #EF4444 70%, #EF4444 100%);
  overflow: visible;
}
.risk-bar-needle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 18px; height: 18px;
  background: #fff;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow: 0 0 0 2px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.5);
  transition: left 0.9s cubic-bezier(0.34,1.56,0.64,1);
}
.risk-bar-segments {
  display: flex;
  gap: 4px;
  margin-top: 8px;
}
.risk-seg {
  flex: 1;
  padding: 5px 0;
  border-radius: 6px;
  text-align: center;
  font-size: 11px;
  font-family: var(--mono);
  font-weight: 700;
  opacity: 0.3;
  transition: opacity 0.4s;
  line-height: 1.4;
}
.risk-seg.active { opacity: 1; }
.risk-seg.safe { background: rgba(34,197,94,0.15); color: var(--safe); border: 1px solid rgba(34,197,94,0.3); }
.risk-seg.warn { background: rgba(245,158,11,0.15); color: var(--warn); border: 1px solid rgba(245,158,11,0.3); }
.risk-seg.danger { background: rgba(239,68,68,0.15); color: var(--danger); border: 1px solid rgba(239,68,68,0.3); }

/* Detail cards */
.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}

.detail-card {
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: 12px;
  padding: 14px 16px;
}

.detail-card.full { grid-column: 1 / -1; }

.detail-card-label {
  font-size: 10px;
  font-family: var(--mono);
  color: var(--muted);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 8px;
}

.detail-card-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--text);
}

.type-badge {
  display: inline-block;
  background: rgba(255,140,66,0.15);
  border: 1px solid rgba(255,140,66,0.3);
  color: var(--accent2);
  font-size: 13px;
  font-weight: 700;
  padding: 4px 12px;
  border-radius: 6px;
}

.highlighted-text {
  font-size: 14px;
  line-height: 1.8;
  color: var(--muted);
}

:deep(.highlight-word) {
  background: rgba(239,68,68,0.2);
  border: 1px solid rgba(239,68,68,0.4);
  color: #FCA5A5;
  border-radius: 4px;
  padding: 0 4px;
  font-weight: 700;
}

.keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.keyword-tag {
  background: rgba(239,68,68,0.1);
  border: 1px solid rgba(239,68,68,0.25);
  color: #FCA5A5;
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 20px;
  font-family: var(--mono);
}

.suggestion-text {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text);
}

/* 165 Link */
.link-165 {
  background: rgba(59,130,246,0.08);
  border: 1px solid rgba(59,130,246,0.25);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  text-decoration: none;
  margin-bottom: 12px;
  transition: all 0.2s;
  cursor: pointer;
}

.link-165:hover {
  background: rgba(59,130,246,0.15);
  border-color: rgba(59,130,246,0.45);
}

.link-165-icon {
  width: 40px;
  height: 40px;
  background: rgba(59,130,246,0.15);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.link-165-text { flex: 1; }
.link-165-text strong { font-size: 14px; color: #60A5FA; display: block; }
.link-165-text span { font-size: 12px; color: var(--muted); font-family: var(--mono); }
.link-165-arrow { color: #60A5FA; font-size: 18px; }

/* Share button */
.share-btn {
  width: 100%;
  background: #00B900;
  border: none;
  border-radius: 12px;
  color: #fff;
  font-family: var(--sans);
  font-weight: 700;
  font-size: 15px;
  padding: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: all 0.2s;
  margin-bottom: 12px;
}

.share-btn:hover { background: #00a100; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(0,185,0,0.35); }

/* Reset */
.reset-btn {
  width: 100%;
  background: transparent;
  border: 1px solid var(--border2);
  border-radius: 12px;
  color: var(--muted);
  font-family: var(--sans);
  font-size: 14px;
  padding: 13px;
  cursor: pointer;
  transition: all 0.2s;
}

.reset-btn:hover { border-color: var(--border2); color: var(--text); background: var(--surface); }

/* Animation */
.fade-in {
  animation: fadeIn 0.4s ease forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
