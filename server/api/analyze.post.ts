import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `你是一位專業的詐騙訊息分析師，擅長辨識各類詐騙手法。

## 任務
分析用戶提供的訊息內容（文字或圖片），判斷是否為詐騙訊息。

## 分析要點
- 檢查是否包含常見詐騙特徵（緊急催促、高報酬承諾、要求個資/轉帳、偽冒身份等）
- 識別詐騙類型（投資詐騙、網購詐騙、假冒客服、感情詐騙、釣魚連結等）
- 分析可疑連結、電話號碼、帳號等資訊

## 輸出格式（繁體中文）

嚴格按照以下 JSON 格式回覆，不要包含其他文字：

{
  "riskLevel": "high" | "medium" | "low" | "safe",
  "riskScore": 0-100,
  "summary": "一句話總結判斷結果",
  "scamType": "詐騙類型（若有）",
  "indicators": ["詐騙特徵1", "詐騙特徵2"],
  "analysis": "詳細分析說明（100-200字）",
  "advice": "給用戶的建議行動"
}`

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const body = await readBody(event)

  if (!body.text && !body.image) {
    throw createError({ statusCode: 400, message: '請提供文字或圖片' })
  }

  const client = new Anthropic({ apiKey: config.anthropicApiKey })

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

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
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
