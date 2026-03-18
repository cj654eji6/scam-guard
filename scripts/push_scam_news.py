"""
定期推播詐騙新聞到 LINE 官方帳號
資料來源：165 官網公告 + Google News
"""

import os
import json
import re
import ssl
import urllib.request
import urllib.parse
from datetime import datetime, timedelta

import anthropic
import certifi

# ── 設定 ──
LINE_TOKEN = os.environ.get("LINE_CHANNEL_ACCESS_TOKEN", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
}
SSL_CTX = ssl.create_default_context(cafile=certifi.where())


# ── 爬取 165 官網公告 ──
def fetch_165_news(limit=5):
    """從 165 全民防騙網抓取最新公告"""
    url = "https://165.npa.gov.tw/api/article/list"
    articles = []

    try:
        # 嘗試 API
        payload = json.dumps({"page": 1, "pageSize": limit, "categoryId": ""}).encode()
        req = urllib.request.Request(url, data=payload, headers={**HEADERS, "Content-Type": "application/json"})
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as resp:
            data = json.loads(resp.read().decode())
            for item in data.get("data", {}).get("list", [])[:limit]:
                articles.append({
                    "title": item.get("title", ""),
                    "summary": item.get("summary", item.get("content", ""))[:200],
                    "url": f"https://165.npa.gov.tw/article/{item.get('id', '')}",
                    "image": item.get("coverImage", ""),
                    "source": "165全民防騙網",
                })
    except Exception as e:
        print(f"165 API 失敗: {e}")

    # 備用：爬取網頁
    if not articles:
        try:
            req = urllib.request.Request("https://165.npa.gov.tw/", headers=HEADERS)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as resp:
                html = resp.read().decode("utf-8", errors="ignore")
                # 簡易提取標題
                titles = re.findall(r'<a[^>]*href="(/article/[^"]+)"[^>]*>([^<]+)</a>', html)
                for href, title in titles[:limit]:
                    articles.append({
                        "title": title.strip(),
                        "summary": "",
                        "url": f"https://165.npa.gov.tw{href}",
                        "image": "",
                        "source": "165全民防騙網",
                    })
        except Exception as e:
            print(f"165 網頁爬取失敗: {e}")

    return articles


# ── 爬取 Google News ──
def fetch_google_news(limit=5):
    """從 Google News RSS 搜尋詐騙相關新聞"""
    query = urllib.parse.quote("台灣 詐騙")
    url = f"https://news.google.com/rss/search?q={query}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"
    articles = []

    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as resp:
            content = resp.read().decode("utf-8", errors="ignore")

        # 簡易 XML 解析
        items = re.findall(r"<item>(.*?)</item>", content, re.DOTALL)
        for item_xml in items[:limit]:
            title = re.search(r"<title>(.*?)</title>", item_xml)
            link = re.search(r"<link/>\s*(.*?)\s*<", item_xml) or re.search(r"<link>(.*?)</link>", item_xml)
            pub_date = re.search(r"<pubDate>(.*?)</pubDate>", item_xml)
            source = re.search(r"<source[^>]*>(.*?)</source>", item_xml)

            articles.append({
                "title": title.group(1).strip() if title else "",
                "summary": "",
                "url": link.group(1).strip() if link else "",
                "image": "",
                "source": source.group(1).strip() if source else "Google News",
            })
    except Exception as e:
        print(f"Google News 失敗: {e}")

    return articles


# ── 嘗試取得新聞 OG 圖片 ──
def fetch_og_image(url):
    """從網頁 meta 標籤取得 Open Graph 圖片"""
    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=5) as resp:
            html = resp.read(50000).decode("utf-8", errors="ignore")
        match = re.search(r'<meta[^>]*property="og:image"[^>]*content="([^"]+)"', html)
        if match:
            return match.group(1)
    except Exception:
        pass
    return ""


# ── Claude AI 摘要 ──
def summarize_with_ai(articles):
    """用 Claude 將新聞整理成推播摘要"""
    if not articles:
        return None

    client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

    news_text = ""
    for i, a in enumerate(articles, 1):
        news_text += f"{i}. [{a['source']}] {a['title']}\n"
        if a["summary"]:
            news_text += f"   摘要：{a['summary'][:150]}\n"
        news_text += f"   連結：{a['url']}\n\n"

    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        system="""你是防詐騙新聞編輯，負責整理最新詐騙資訊給民眾閱讀。

請從提供的新聞中挑選最重要的 3 則，用繁體中文整理成推播摘要。

輸出 JSON 格式：
{
  "headline": "今日防詐快報標題（10字內）",
  "articles": [
    {
      "title": "新聞標題（精簡）",
      "summary": "50字內摘要，重點是民眾該注意什麼",
      "url": "原始連結",
      "source": "來源"
    }
  ],
  "tip": "一句防詐小提醒（30字內）"
}""",
        messages=[{"role": "user", "content": f"以下是今天蒐集到的詐騙相關新聞：\n\n{news_text}"}],
    )

    text = response.content[0].text if response.content[0].type == "text" else ""
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        return json.loads(match.group(0))
    return None


# ── 建立 LINE Flex Message ──
def build_flex_message(data, images):
    """建立圖文並茂的 Flex Message"""
    bubbles = []

    for i, article in enumerate(data["articles"]):
        img_url = images.get(i, "")

        body_contents = [
            {
                "type": "text",
                "text": article["title"],
                "weight": "bold",
                "size": "md",
                "wrap": True,
                "color": "#FFFFFF",
            },
            {
                "type": "text",
                "text": article["summary"],
                "size": "sm",
                "wrap": True,
                "color": "#B0B0B0",
                "margin": "md",
            },
            {
                "type": "text",
                "text": f"📰 {article['source']}",
                "size": "xs",
                "color": "#6B7280",
                "margin": "md",
            },
        ]

        bubble = {
            "type": "bubble",
            "size": "kilo",
            "styles": {
                "body": {"backgroundColor": "#111827"},
                "footer": {"backgroundColor": "#111827"},
            },
            "body": {
                "type": "box",
                "layout": "vertical",
                "contents": body_contents,
                "paddingAll": "16px",
            },
            "footer": {
                "type": "box",
                "layout": "vertical",
                "contents": [
                    {
                        "type": "button",
                        "action": {
                            "type": "uri",
                            "label": "查看詳情",
                            "uri": article["url"],
                        },
                        "style": "primary",
                        "color": "#FF4B4B",
                        "height": "sm",
                    }
                ],
            },
        }

        # 有圖片就加上 hero
        if img_url:
            bubble["hero"] = {
                "type": "image",
                "url": img_url,
                "size": "full",
                "aspectRatio": "20:13",
                "aspectMode": "cover",
            }

        bubbles.append(bubble)

    # 頭部卡片
    header_bubble = {
        "type": "bubble",
        "size": "kilo",
        "styles": {"body": {"backgroundColor": "#0A0E1A"}},
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "text",
                    "text": "🛡️ " + data["headline"],
                    "weight": "bold",
                    "size": "lg",
                    "color": "#FF4B4B",
                },
                {
                    "type": "text",
                    "text": datetime.now().strftime("%Y/%m/%d") + " 防詐快報",
                    "size": "sm",
                    "color": "#7A8499",
                    "margin": "md",
                },
                {
                    "type": "separator",
                    "margin": "lg",
                    "color": "#1F2937",
                },
                {
                    "type": "text",
                    "text": "💡 " + data.get("tip", "提高警覺，守護財產安全"),
                    "size": "sm",
                    "wrap": True,
                    "color": "#F59E0B",
                    "margin": "lg",
                },
            ],
            "paddingAll": "20px",
        },
    }

    return {
        "type": "flex",
        "altText": f"🛡️ {data['headline']} - 防詐快報",
        "contents": {
            "type": "carousel",
            "contents": [header_bubble] + bubbles,
        },
    }


# ── LINE 推播（Broadcast） ──
def broadcast_message(message):
    """推播訊息給所有好友"""
    url = "https://api.line.me/v2/bot/message/broadcast"
    payload = json.dumps({"messages": [message]}).encode()
    req = urllib.request.Request(
        url,
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {LINE_TOKEN}",
        },
    )
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as resp:
        print(f"LINE 推播結果: {resp.status}")
        return resp.status == 200


# ── 主流程 ──
def main():
    print("=== 開始抓取詐騙新聞 ===")

    # 1. 抓取新聞
    news_165 = fetch_165_news(5)
    print(f"165 公告: {len(news_165)} 則")

    news_google = fetch_google_news(5)
    print(f"Google News: {len(news_google)} 則")

    all_news = news_165 + news_google
    if not all_news:
        print("沒有取得任何新聞，結束")
        return

    # 2. AI 摘要
    print("=== AI 摘要整理中 ===")
    summary = summarize_with_ai(all_news)
    if not summary:
        print("AI 摘要失敗，結束")
        return

    print(f"標題: {summary['headline']}")
    for a in summary["articles"]:
        print(f"  - {a['title']}")

    # 3. 取得圖片
    print("=== 取得新聞圖片 ===")
    images = {}
    for i, article in enumerate(summary["articles"]):
        # 先從原始資料找圖
        for orig in all_news:
            if orig["title"] in article["title"] or article["title"] in orig["title"]:
                if orig.get("image"):
                    images[i] = orig["image"]
                    break
        # 沒有就嘗試 OG 圖片
        if i not in images and article.get("url"):
            og_img = fetch_og_image(article["url"])
            if og_img:
                images[i] = og_img

    print(f"取得 {len(images)} 張圖片")

    # 4. 建立 Flex Message 並推播
    print("=== 推播中 ===")
    flex_msg = build_flex_message(summary, images)
    success = broadcast_message(flex_msg)
    print(f"推播{'成功' if success else '失敗'}！")


if __name__ == "__main__":
    main()
