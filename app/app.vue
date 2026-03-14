<script setup lang="ts">
const { init } = useLiff()

onMounted(() => {
  init()
})
</script>

<template>
  <div class="app">
    <ScamAnalyzer />
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=Space+Mono:wght@400;700&display=swap');

:root {
  --bg: #0A0E1A;
  --surface: #111827;
  --surface2: #1a2235;
  --border: rgba(255,255,255,0.08);
  --border2: rgba(255,255,255,0.15);
  --text: #E8ECF4;
  --muted: #7A8499;
  --accent: #FF4B4B;
  --accent2: #FF8C42;
  --safe: #22C55E;
  --warn: #F59E0B;
  --danger: #EF4444;
  --blue: #3B82F6;
  --mono: 'Space Mono', monospace;
  --sans: 'Noto Sans TC', sans-serif;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  min-height: 100vh;
  overflow-x: hidden;
}

body::before {
  content: '';
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(255,75,75,0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,75,75,0.03) 1px, transparent 1px);
  background-size: 40px 40px;
  z-index: 0;
  pointer-events: none;
}

.app {
  position: relative;
  z-index: 1;
  max-width: 480px;
  margin: 0 auto;
  padding: 24px 20px 48px;
}
</style>
