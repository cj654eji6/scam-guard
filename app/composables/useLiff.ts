import liff from '@line/liff'

const isInitialized = ref(false)
const profile = ref<{ displayName: string; pictureUrl?: string } | null>(null)

export function useLiff() {
  const config = useRuntimeConfig()

  async function init() {
    if (isInitialized.value) return

    try {
      await liff.init({ liffId: config.public.liffId })
      isInitialized.value = true

      if (liff.isLoggedIn()) {
        const p = await liff.getProfile()
        profile.value = { displayName: p.displayName, pictureUrl: p.pictureUrl }
      }
    } catch (e) {
      console.error('LIFF 初始化失敗:', e)
    }
  }

  function login() {
    if (!liff.isLoggedIn()) {
      liff.login()
    }
  }

  function closeLiff() {
    if (liff.isInClient()) {
      liff.closeWindow()
    }
  }

  return { init, login, closeLiff, isInitialized, profile }
}
