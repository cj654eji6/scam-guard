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
const isOriginalExpanded = ref(false)

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

function stripProtocol(text: string): string {
  return text.replace(/https?:\/\//gi, '')
}

async function shareResult() {
  if (!result.value) return
  const r = result.value
  const strippedText = stripProtocol(inputText.value.trim())
  const originalPart = strippedText ? `\n\n📋 被鑑定的可疑訊息：\n${strippedText}` : ''
  const text = `🛡️ 詐騙鑑定結果\n\n風險分數：${r.riskScore}/100\n類型：${r.scamType || '無明顯詐騙類型'}\n${r.summary}\n\n建議：${r.advice}${originalPart}\n\n🚨 詳情請見 165 反詐騙網站：https://165.npa.gov.tw\n\n👉 立即試試「防詐獵人」，一鍵識破詐騙無所遁形！\nhttps://line.me/R/ti/p/@793pgncd`

  // 如果有上傳截圖，準備圖片檔案
  const files: File[] = []
  if (imageData.value) {
    try {
      const byteString = atob(imageData.value)
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
      const ext = imageType.value.split('/')[1] || 'png'
      files.push(new File([ab], `scam-evidence.${ext}`, { type: imageType.value }))
    } catch { /* 圖片轉換失敗，僅分享文字 */ }
  }

  // 優先使用 Web Share API
  if (navigator.share) {
    try {
      const shareData: ShareData = { title: '詐騙鑑定結果', text }
      if (files.length && navigator.canShare?.({ files })) {
        shareData.files = files
      }
      await navigator.share(shareData)
      return
    } catch (e: unknown) {
      // 使用者主動取消分享，不做任何事
      if (e instanceof DOMException && e.name === 'AbortError') return
      // 其他錯誤 → fallback 到剪貼簿
    }
  }

  // Fallback：複製到剪貼簿
  try {
    await navigator.clipboard.writeText(text)
    alert('鑑定結果已複製！請貼給親友查看。')
  } catch {
    alert('無法分享，請手動複製結果。')
  }
}

function resetAll() {
  inputText.value = ''
  imageData.value = null
  result.value = null
  uploadError.value = ''
  isOriginalExpanded.value = false
  if (fileInput.value) fileInput.value.value = ''
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="header">
      <img src="/favicon.png" alt="防詐獵人" class="logo-img" />
      <div class="header-text">
        <h1>詐騙鑑定器</h1>
        <p>SCAM DETECTOR v1.0</p>
      </div>
    </div>

    <!-- Input Section -->
    <div v-if="!isLoading && !result">
      <div class="input-card">
        <div class="input-label">貼上可疑訊息</div>
        <div class="textarea-wrap">
          <textarea
            v-model="inputText"
            placeholder="請貼上您收到的可疑訊息，例如：「恭喜您中獎了！點擊連結立即領取 NT$50,000 獎金…」"
          />
          <button v-if="inputText" class="clear-btn" @click="inputText = ''">✕</button>
        </div>
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

      <div class="disclaimer">
        本工具鑑定結果僅供參考，詐騙手法變化極快，如有疑慮請以 165 官方資訊為準，或直接撥打 165 反詐騙專線確認。
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
        <div class="score-left">
          <div class="score-label">風險分數</div>
          <div class="score-number">{{ result.riskScore }}</div>
        </div>
        <div class="score-right">
          <div class="score-verdict">{{ verdictText }}</div>
          <div class="risk-bar-track">
            <div class="risk-bar-needle" :style="{ left: result.riskScore + '%' }" />
          </div>
          <div class="risk-bar-segments">
            <div class="risk-seg safe" :class="{ active: riskLevel === 'safe' }">✓ 安全<br>0–30</div>
            <div class="risk-seg warn" :class="{ active: riskLevel === 'warn' }">⚡ 可疑<br>31–70</div>
            <div class="risk-seg danger" :class="{ active: riskLevel === 'danger' }">⚠ 高風險<br>71–100</div>
          </div>
        </div>
      </div>

      <div class="type-row">
        <span class="type-label">詐騙類型</span>
        <span class="type-badge">{{ result.scamType || '無明顯詐騙類型' }}</span>
      </div>

      <div class="advice-card">
        <div class="advice-card-label">⚠ 建議行動</div>
        <div class="advice-text">{{ result.advice }}</div>
      </div>

      <div class="analysis-card">
        <div class="analysis-card-label">分析說明</div>
        <div class="analysis-text">{{ result.analysis }}</div>
      </div>

      <div v-if="result.indicators.length" class="keywords-card">
        <div class="keywords-label">可疑關鍵詞</div>
        <div class="keywords">
          <span v-for="kw in result.indicators" :key="kw" class="keyword-tag">{{ kw }}</span>
        </div>
      </div>

      <div v-if="inputText.trim()" class="original-card">
        <button class="original-toggle" @click="isOriginalExpanded = !isOriginalExpanded">
          <span class="original-toggle-label">📋 原始訊息</span>
          <span class="original-toggle-arrow" :class="{ expanded: isOriginalExpanded }">▼</span>
        </button>
        <div v-if="isOriginalExpanded" class="original-text">{{ inputText.trim() }}</div>
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
        <span>💬</span> 分享鑑定結果
      </button>

      <button class="reset-btn" @click="resetAll">重新鑑定</button>

      <div class="disclaimer">
        本工具鑑定結果僅供參考，詐騙手法變化極快，如有疑慮請以 165 官方資訊為準，或直接撥打 165 反詐騙專線確認。
      </div>
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

.logo-img {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
  filter: drop-shadow(0 0 12px rgba(59, 130, 246, 0.4));
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

.textarea-wrap {
  position: relative;
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
  padding-right: 40px;
  resize: none;
  min-height: 130px;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.clear-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.15);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}

.clear-btn:hover {
  background: rgba(255,75,75,0.3);
  color: #fff;
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

/* Score card - 橫排緊湊版 */
.score-card {
  background: var(--surface);
  border: 1.5px solid var(--border2);
  border-radius: 18px;
  padding: 18px 20px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 18px;
  position: relative;
  overflow: hidden;
}

.score-card::before {
  content: '';
  position: absolute;
  top: -40px; left: -20px;
  width: 160px; height: 160px;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.15;
}

.score-card.safe::before { background: var(--safe); }
.score-card.warn::before { background: var(--warn); }
.score-card.danger::before { background: var(--danger); }

.score-left { text-align: center; flex-shrink: 0; }
.score-right { flex: 1; }

.score-label {
  font-size: 10px;
  font-family: var(--mono);
  color: var(--muted);
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.score-number {
  font-size: 64px;
  font-weight: 900;
  line-height: 1;
  font-family: var(--mono);
}

.score-card.safe .score-number { color: var(--safe); }
.score-card.warn .score-number { color: var(--warn); }
.score-card.danger .score-number { color: var(--danger); }

.score-verdict {
  font-size: 20px;
  font-weight: 800;
  padding: 7px 14px;
  border-radius: 30px;
  display: inline-block;
  margin-bottom: 10px;
}

.score-card.safe .score-verdict { background: rgba(34,197,94,0.15); color: var(--safe); border: 1.5px solid rgba(34,197,94,0.3); }
.score-card.warn .score-verdict { background: rgba(245,158,11,0.15); color: var(--warn); border: 1.5px solid rgba(245,158,11,0.3); }
.score-card.danger .score-verdict { background: rgba(239,68,68,0.15); color: var(--danger); border: 1.5px solid rgba(239,68,68,0.3); }

/* Risk bar */
.risk-bar-track {
  position: relative;
  height: 10px;
  border-radius: 99px;
  background: linear-gradient(to right, #22C55E 0%, #22C55E 30%, #F59E0B 30%, #F59E0B 70%, #EF4444 70%, #EF4444 100%);
  overflow: visible;
  margin-bottom: 8px;
}
.risk-bar-needle {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 18px; height: 18px;
  background: #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(0,0,0,0.3), 0 2px 6px rgba(0,0,0,0.5);
  transition: left 0.9s cubic-bezier(0.34,1.56,0.64,1);
}
.risk-bar-segments {
  display: flex;
  gap: 4px;
}
.risk-seg {
  flex: 1;
  padding: 5px 0;
  border-radius: 8px;
  text-align: center;
  font-size: 11px;
  font-family: var(--mono);
  font-weight: 700;
  opacity: 0.35;
  transition: opacity 0.4s;
  line-height: 1.4;
}
.risk-seg.active { opacity: 1; }
.risk-seg.safe { background: rgba(34,197,94,0.15); color: var(--safe); border: 1px solid rgba(34,197,94,0.3); }
.risk-seg.warn { background: rgba(245,158,11,0.15); color: var(--warn); border: 1px solid rgba(245,158,11,0.3); }
.risk-seg.danger { background: rgba(239,68,68,0.15); color: var(--danger); border: 1px solid rgba(239,68,68,0.3); }

/* 詐騙類型 */
.type-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.type-label { font-size: 20px; color: var(--muted); font-weight: 700; }
.type-badge {
  display: inline-block;
  background: rgba(255,140,66,0.15);
  border: 1.5px solid rgba(255,140,66,0.35);
  color: var(--accent2);
  font-size: 20px;
  font-weight: 700;
  padding: 5px 16px;
  border-radius: 8px;
}

/* 建議行動（強調） */
.advice-card {
  background: rgba(239,68,68,0.07);
  border: 2px solid rgba(239,68,68,0.35);
  border-radius: 18px;
  padding: 22px;
  margin-bottom: 12px;
}
.advice-card-label {
  font-size: 20px;
  color: var(--danger);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 14px;
  font-weight: 700;
}
.advice-text {
  font-size: 21px;
  line-height: 1.85;
  color: #fff;
  font-weight: 800;
}

/* 分析說明 */
.analysis-card {
  background: var(--surface);
  border: 1.5px solid var(--border2);
  border-radius: 18px;
  padding: 22px;
  margin-bottom: 12px;
}
.analysis-card-label {
  font-size: 20px;
  color: var(--muted);
  letter-spacing: 1px;
  text-transform: uppercase;
  margin-bottom: 14px;
  font-weight: 700;
}
.analysis-text {
  font-size: 19px;
  line-height: 1.9;
  color: #ddd;
}

/* 可疑關鍵詞 */
.keywords-card {
  background: var(--surface);
  border: 1.5px solid var(--border2);
  border-radius: 18px;
  padding: 18px 20px;
  margin-bottom: 12px;
}
.keywords-label {
  font-size: 20px;
  color: var(--muted);
  letter-spacing: 1px;
  text-transform: uppercase;
  font-weight: 700;
  margin-bottom: 12px;
}
.keywords {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.keyword-tag {
  background: rgba(239,68,68,0.12);
  border: 1px solid rgba(239,68,68,0.3);
  color: #FCA5A5;
  font-size: 20px;
  padding: 7px 16px;
  border-radius: 30px;
}

/* 原始訊息折疊卡 */
.original-card {
  background: var(--surface);
  border: 1.5px solid var(--border2);
  border-radius: 18px;
  margin-bottom: 12px;
  overflow: hidden;
}
.original-toggle {
  width: 100%;
  background: transparent;
  border: none;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  color: var(--text);
}
.original-toggle-label {
  font-size: 20px;
  font-weight: 700;
  color: var(--muted);
  letter-spacing: 0.5px;
}
.original-toggle-arrow {
  font-size: 14px;
  color: var(--muted);
  transition: transform 0.25s;
}
.original-toggle-arrow.expanded {
  transform: rotate(180deg);
}
.original-text {
  font-size: 17px;
  line-height: 1.8;
  color: #bbb;
  padding: 0 20px 18px;
  white-space: pre-wrap;
  word-break: break-all;
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
  font-size: 20px;
  padding: 18px;
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
  background: rgba(255,255,255,0.12);
  border: 2px solid rgba(255,255,255,0.35);
  border-radius: 16px;
  color: #fff;
  font-family: var(--sans);
  font-size: 20px;
  font-weight: 700;
  padding: 18px;
  cursor: pointer;
  transition: all 0.2s;
  letter-spacing: 0.5px;
}

.reset-btn:hover { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.55); }

/* Disclaimer */
.disclaimer {
  margin-top: 16px;
  padding: 14px 16px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--muted);
  text-align: center;
}

/* Animation */
.fade-in {
  animation: fadeIn 0.4s ease forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
