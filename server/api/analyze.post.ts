import Anthropic from '@anthropic-ai/sdk'
import fraudSitesData from './data/fraud_sites.json'

interface FraudSite {
  siteName: string
  site: string
  count: number
  week: number
}

const fraudSites: FraudSite[] = fraudSitesData as FraudSite[]

function extractUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s,，。？！\)）"']+/gi) ?? []
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return url.toLowerCase().split('/')[0] ?? ''
  }
}

async function expandUrl(url: string): Promise<string> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
    clearTimeout(timer)
    return res.url
  } catch {
    return url
  }
}

function findBlacklistHit(domains: string[]): FraudSite | null {
  for (const domain of domains) {
    const hit = fraudSites.find(entry => {
      const fraudDomain = entry.site.toLowerCase().replace(/^https?:\/\//, '').split('/')[0] ?? ''
      return domain === fraudDomain || domain.endsWith('.' + fraudDomain) || fraudDomain.endsWith('.' + domain)
    })
    if (hit) return hit
  }
  return null
}

const SYSTEM_PROMPT = `你是一位專業的詐騙訊息分析師，擅長辨識各類詐騙手法。

## 任務
分析用戶提供的訊息內容（文字或圖片），判斷是否為詐騙訊息。

## 分析要點
- 檢查是否包含常見詐騙特徵（緊急催促、高報酬承諾、要求個資/轉帳、偽冒身份等）
- 識別詐騙類型（投資詐騙、網購詐騙、假冒客服、感情詐騙、釣魚連結等）
- 分析可疑連結、電話號碼、帳號等資訊

## 重要判斷原則：以「行為意圖」為主要風險信號

**合法行銷訊息的特徵（應判為低風險或安全）：**
- 企業推廣貸款、信用卡、申辦服務，包含利率、額度、優惠等資訊，但沒有要求立即提供個資或付款
- 訊息只介紹產品或服務，沒有緊迫催促立即轉帳或輸入敏感資料
- 有明確的企業來源標示

**高風險的核心行為（才應提高風險評級）：**
- 要求提供帳號密碼、身分證、信用卡號等個資
- 要求匯款、轉帳、購買禮品卡
- 冒充政府機關（警察、檢察官、健保署等）或銀行客服
- 聲稱帳號異常、包裹被扣、涉及案件，需要立即處理

**不應單獨作為高風險依據的表面特徵：**
- 縮短網址或追蹤連結（合法行銷訊息普遍使用）
- 促銷話術（限時優惠、免費贈送、抽獎）
- 誇大用詞（巨量、海量、超值）
- 民國年份（台灣官方文件、帳單、電信業者普遍使用民國紀年，例如民國115年即西元2026年，不應視為異常）
- 企業通常擁有多個合法域名（.tw、.com.tw、.net、.com 等不同後綴），不可因域名後綴不同就判定為仿冒

**網址判斷原則：**
- 重點是網址域名是否與訊息聲稱的品牌一致，而非網址長短
- 若訊息標示了明確的品牌來源（如 [MyCard]、[蝦皮]），且網址域名能對應該品牌，應視為低風險
- 以下情況應視為高風險網址：
  * 聲稱是某品牌但域名完全無關（如聲稱 LINE 官方卻連到 line-verify-tw.com）
  * 使用仿冒域名（在知名品牌名稱後加 -tw、-official、-verify 等）
  * 域名使用免費或可疑的頂級域名（.xyz、.top、.click 等）偽裝官方
  * 訊息要求點擊連結後輸入帳號密碼或個人資料
- **不可自行推斷某品牌「唯一正確的域名」**：你無法確認一個域名是否為某企業的官方域名，因此域名本身的「正確性」不應作為風險依據，應聚焦在訊息要求用戶做什麼

## 輸出格式（繁體中文）

嚴格按照以下 JSON 格式回覆，不要包含其他文字：

{
  "riskLevel": "high" | "medium" | "low" | "safe",
  "riskScore": 0-100,
  "summary": "一句話總結判斷結果",
  "scamType": "詐騙類型（若有）",
  "indicators": ["詐騙特徵1", "詐騙特徵2"],
  "analysis": "詳細分析說明（100-200字）",
  "advice": "給用戶的建議行動",
  "detectedUrls": ["圖片中辨識到的所有網址或域名，沒有則為空陣列"]
}`

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY || ''
  const body = await readBody(event)

  if (!body.text && !body.image) {
    throw createError({ statusCode: 400, message: '請提供文字或圖片' })
  }

  if (body.image && body.image.length * 0.75 > 5 * 1024 * 1024) {
    throw createError({ statusCode: 413, message: '圖片超過 5 MB 限制，請壓縮後再上傳' })
  }

  if (body.text && body.text.length > 5000) {
    throw createError({ statusCode: 400, message: '文字過長，請縮短至 5000 字以內' })
  }

  if (body.text) {
    const urls = extractUrls(body.text)
    const expandedUrls = await Promise.all(urls.map(expandUrl))
    const domains = expandedUrls.map(getDomain).filter(Boolean)
    const hit = findBlacklistHit(domains)
    if (hit) {
      return {
        riskLevel: 'high',
        riskScore: 95,
        summary: `偵測到 165 反詐騙專線通報之詐騙網站：${hit.site}`,
        scamType: '詐騙博弈網站（165通報）',
        indicators: [`網址 ${hit.site} 已被通報 ${hit.count} 次`, `列管名稱：${hit.siteName}`],
        analysis: `此訊息包含的網址已收錄於 165 反詐騙專線的詐騙網站黑名單（${hit.site}），累計通報次數為 ${hit.count} 次。此類網站通常為詐騙博弈平台，請勿點擊或進行任何交易。`,
        advice: '請勿點擊該網址，立即封鎖傳送者，並可撥打 165 反詐騙專線回報。',
      }
    }
  }

  const client = new Anthropic({ apiKey })

  const content: Anthropic.MessageCreateParams['messages'][0]['content'] = []

  if (body.image) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: body.imageType || 'image/png',
        data: body.image,
      },
    })
    content.push({
      type: 'text',
      text: '請分析這張圖片中的訊息內容，判斷是否為詐騙。',
    })
  }

  if (body.text) {
    content.push({
      type: 'text',
      text: `請分析以下訊息是否為詐騙：\n\n${body.text}`,
    })
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  })

  const firstBlock = response.content[0];
  const text = firstBlock?.type === 'text' ? firstBlock.text : '';

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0])

      // 圖片分析：對 Claude 辨識到的網址做黑名單比對
      if (body.image && Array.isArray(result.detectedUrls) && result.detectedUrls.length > 0) {
        const expandedUrls = await Promise.all(result.detectedUrls.map(expandUrl))
        const domains = expandedUrls.map(getDomain).filter(Boolean)
        const hit = findBlacklistHit(domains)
        if (hit) {
          return {
            riskLevel: 'high',
            riskScore: 95,
            summary: `偵測到 165 反詐騙專線通報之詐騙網站：${hit.site}`,
            scamType: '詐騙博弈網站（165通報）',
            indicators: [`網址 ${hit.site} 已被通報 ${hit.count} 次`, `列管名稱：${hit.siteName}`],
            analysis: `圖片中包含的網址「${hit.site}」已收錄於 165 反詐騙專線的詐騙網站黑名單，累計通報次數為 ${hit.count} 次。此類網站通常為詐騙博弈平台，請勿點擊或進行任何交易。`,
            advice: '請勿點擊該網址，立即封鎖傳送者，並可撥打 165 反詐騙專線回報。',
          }
        }
      }

      const { detectedUrls: _, ...finalResult } = result
      return finalResult
    }
  } catch {
    // fallback
  }

  return {
    riskLevel: 'medium',
    riskScore: 50,
    summary: '無法完成分析',
    scamType: '未知',
    indicators: [],
    analysis: text,
    advice: '請提高警覺，如有疑慮請撥打 165 反詐騙專線。',
  }
})
