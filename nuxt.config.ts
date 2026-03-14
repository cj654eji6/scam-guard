// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  runtimeConfig: {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    public: {
      liffId: process.env.LIFF_ID || '2009444571-MZnNrudg',
    },
  },

  app: {
    head: {
      title: '詐騙訊息鑑定器',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' },
        { name: 'description', content: '利用 AI 技術即時辨識詐騙訊息' },
      ],
    },
  },
})
