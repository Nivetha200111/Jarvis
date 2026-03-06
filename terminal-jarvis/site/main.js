const releasePageUrl = 'https://github.com/Nivetha200111/Jarvis/releases'
const latestReleaseApi = 'https://api.github.com/repos/Nivetha200111/Jarvis/releases/latest'

const recommendedDownloadButton = document.getElementById('recommended-download')
const linuxDownloadButton = document.getElementById('linux-download')
const windowsDownloadButton = document.getElementById('windows-download')
const detectedOsLabel = document.getElementById('detected-os')
const releaseNoteLabel = document.getElementById('release-note')

const detectOs = () => {
  const platform = window.navigator.userAgent.toLowerCase()

  if (platform.includes('win')) {
    return 'windows'
  }

  if (platform.includes('linux') || platform.includes('x11')) {
    return 'linux'
  }

  return 'fallback'
}

const setAnchorTarget = (anchor, href) => {
  if (!anchor) {
    return
  }

  anchor.href = href
}

const getAsset = (assets, pattern) => assets.find((asset) => pattern.test(asset.name))

const updateRecommendedButton = (os, linuxUrl, windowsUrl) => {
  if (!recommendedDownloadButton) {
    return
  }

  if (os === 'windows' && windowsUrl) {
    setAnchorTarget(recommendedDownloadButton, windowsUrl)
    recommendedDownloadButton.textContent = 'Download for Windows'
    return
  }

  if (os === 'linux' && linuxUrl) {
    setAnchorTarget(recommendedDownloadButton, linuxUrl)
    recommendedDownloadButton.textContent = 'Download for Linux'
    return
  }

  setAnchorTarget(recommendedDownloadButton, releasePageUrl)
  recommendedDownloadButton.textContent = 'Open Releases'
}

const setDetectedOsText = (os) => {
  if (!detectedOsLabel) {
    return
  }

  if (os === 'windows') {
    detectedOsLabel.textContent = 'Detected OS: Windows'
    return
  }

  if (os === 'linux') {
    detectedOsLabel.textContent = 'Detected OS: Linux'
    return
  }

  detectedOsLabel.textContent = 'Detected OS: Unsupported/Unknown'
}

const showNoReleaseMessage = () => {
  if (releaseNoteLabel) {
    releaseNoteLabel.textContent = 'No packaged release artifacts found yet. Use the release page for source snapshots.'
  }
}

const showReadyMessage = (tagName) => {
  if (releaseNoteLabel) {
    releaseNoteLabel.textContent = tagName
      ? `Latest release ${tagName} detected. Download buttons now point to current Linux/Windows assets.`
      : 'Release artifacts detected. Download buttons now point to the latest assets.'
  }
}

const configureDownloadLinks = async () => {
  const os = detectOs()

  setDetectedOsText(os)
  setAnchorTarget(recommendedDownloadButton, releasePageUrl)
  setAnchorTarget(linuxDownloadButton, releasePageUrl)
  setAnchorTarget(windowsDownloadButton, releasePageUrl)

  try {
    const response = await fetch(latestReleaseApi, {
      headers: {
        Accept: 'application/vnd.github+json'
      }
    })

    if (!response.ok) {
      showNoReleaseMessage()
      updateRecommendedButton(os)
      return
    }

    const payload = await response.json()
    const assets = Array.isArray(payload.assets) ? payload.assets : []
    const tagName = typeof payload.tag_name === 'string' ? payload.tag_name : ''

    const linuxAsset = getAsset(assets, /linux.*(x64|amd64).*(\.tar\.gz|\.appimage)$/i)
    const windowsAsset = getAsset(assets, /windows.*(x64|amd64).*(\.zip|\.exe)$/i)

    const linuxUrl = linuxAsset?.browser_download_url
    const windowsUrl = windowsAsset?.browser_download_url

    if (linuxUrl) {
      setAnchorTarget(linuxDownloadButton, linuxUrl)
    }

    if (windowsUrl) {
      setAnchorTarget(windowsDownloadButton, windowsUrl)
    }

    if (!linuxUrl && !windowsUrl) {
      showNoReleaseMessage()
    } else {
      showReadyMessage(tagName)
    }

    updateRecommendedButton(os, linuxUrl, windowsUrl)
  } catch {
    showNoReleaseMessage()
    updateRecommendedButton(os)
  }
}

void configureDownloadLinks()

// scroll-triggered entrance animations
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        observer.unobserve(entry.target)
      }
    }
  },
  { threshold: 0.08 }
)

document.querySelectorAll('.anim-in').forEach((el) => observer.observe(el))

const initializeImmersiveDemo = () => {
  const root = document.getElementById('demo')
  if (!root) {
    return
  }

  const replayButton = document.getElementById('demo-replay')
  const modeChip = document.getElementById('demo-chip-mode')
  const vaultChip = document.getElementById('demo-chip-vault')
  const scheduleChip = document.getElementById('demo-chip-schedule')
  const modelText = document.getElementById('demo-model')
  const vaultCountText = document.getElementById('demo-vault-count')
  const scheduleCountText = document.getElementById('demo-schedule-count')
  const statusText = document.getElementById('demo-status-text')
  const chat = document.getElementById('demo-chat')
  const inputText = document.getElementById('demo-input-text')

  if (
    !replayButton
    || !modeChip
    || !vaultChip
    || !scheduleChip
    || !modelText
    || !vaultCountText
    || !scheduleCountText
    || !statusText
    || !chat
    || !inputText
  ) {
    return
  }

  const steps = [
    {
      mode: 'agent',
      model: 'qwen2.5:3b',
      vaultOn: true,
      scheduleOn: true,
      vaultCount: '7 notes',
      scheduleCount: '5 events',
      prompt: 'summarize my day and flag schedule conflicts',
      context: 'Fetched vault + calendar context.',
      answer:
        'Pulled context from 7 vault notes and 5 events. Conflict found: design review overlaps sprint planning by 30 minutes.'
    },
    {
      mode: 'agent',
      model: 'qwen2.5:3b',
      vaultOn: true,
      scheduleOn: true,
      vaultCount: '9 notes',
      scheduleCount: '5 events',
      prompt: 'draft a prep checklist and save it to vault',
      context: 'Writing note and linking relevant docs.',
      answer:
        'Checklist drafted and saved to Jarvis/2026-03-06.md. Included agenda, blockers, and decision owners.'
    },
    {
      mode: 'fast',
      model: 'qwen2.5:1.5b',
      vaultOn: true,
      scheduleOn: true,
      vaultCount: '9 notes',
      scheduleCount: '6 events',
      prompt: 'queue tomorrow priorities in order',
      context: 'Using latest schedule and pending tasks.',
      answer:
        'Priorities queued: 1) finalize deck 2) QA pass 3) release note draft. Added local reminder for 09:30.'
    }
  ]

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  let runId = 0
  let replayTimer
  let running = false
  const pendingTimeouts = new Set()

  const scheduleTimeout = (callback, ms) => {
    const timeoutId = window.setTimeout(() => {
      pendingTimeouts.delete(timeoutId)
      callback()
    }, ms)
    pendingTimeouts.add(timeoutId)
    return timeoutId
  }

  const clearPendingTimeouts = () => {
    for (const timeoutId of pendingTimeouts) {
      window.clearTimeout(timeoutId)
    }
    pendingTimeouts.clear()
  }

  const wait = (ms, token) =>
    new Promise((resolve) => {
      scheduleTimeout(() => {
        resolve(token === runId)
      }, ms)
    })

  const stopReplayTimer = () => {
    if (replayTimer) {
      window.clearTimeout(replayTimer)
      replayTimer = undefined
    }
  }

  const setStatus = (value) => {
    statusText.textContent = value
  }

  const scrollChatToBottom = () => {
    chat.scrollTop = chat.scrollHeight
  }

  const addMessage = (variant, text) => {
    const node = document.createElement('div')
    node.className = `demo-msg demo-msg--${variant}`
    node.textContent = text
    chat.appendChild(node)
    while (chat.childElementCount > 14) {
      chat.removeChild(chat.firstChild)
    }
    scrollChatToBottom()
    return node
  }

  const applyState = (step) => {
    modeChip.textContent = step.mode
    vaultChip.textContent = step.vaultOn ? 'vault on' : 'vault off'
    scheduleChip.textContent = step.scheduleOn ? 'schedule on' : 'schedule off'

    modeChip.classList.add('demo-chip--active')
    vaultChip.classList.toggle('demo-chip--active', step.vaultOn)
    scheduleChip.classList.toggle('demo-chip--active', step.scheduleOn)

    modelText.textContent = step.model
    vaultCountText.textContent = step.vaultCount
    scheduleCountText.textContent = step.scheduleCount
  }

  const typeInput = async (text, token) => {
    inputText.textContent = ''

    if (reducedMotion) {
      inputText.textContent = text
      return token === runId
    }

    for (const char of text) {
      if (token !== runId) {
        return false
      }
      inputText.textContent += char
      const stillCurrent = await wait(18, token)
      if (!stillCurrent) {
        return false
      }
    }

    return token === runId
  }

  const streamAnswer = async (text, token) => {
    const node = addMessage('assistant', 'jarvis> ')

    if (reducedMotion) {
      node.textContent = `jarvis> ${text}`
      return token === runId
    }

    const chunks = text.split(/(\s+)/).filter(Boolean)
    for (const chunk of chunks) {
      if (token !== runId) {
        return false
      }
      node.textContent += chunk
      scrollChatToBottom()
      const stillCurrent = await wait(chunk.trim().length === 0 ? 14 : 44, token)
      if (!stillCurrent) {
        return false
      }
    }

    return token === runId
  }

  const run = async () => {
    runId += 1
    const token = runId
    running = true
    stopReplayTimer()
    clearPendingTimeouts()

    chat.replaceChildren()
    inputText.textContent = ''
    addMessage('thinking', '~ live simulation started')

    for (const step of steps) {
      if (token !== runId) {
        running = false
        return
      }

      applyState(step)
      setStatus('typing...')

      const typed = await typeInput(step.prompt, token)
      if (!typed) {
        running = false
        return
      }

      addMessage('user', `you> ${step.prompt}`)
      inputText.textContent = ''

      setStatus('retrieving context...')
      addMessage('thinking', `~ ${step.context}`)
      const contextWait = await wait(reducedMotion ? 120 : 520, token)
      if (!contextWait) {
        running = false
        return
      }

      setStatus('generating...')
      const streamed = await streamAnswer(step.answer, token)
      if (!streamed) {
        running = false
        return
      }

      setStatus('ready')
      const loopWait = await wait(reducedMotion ? 160 : 900, token)
      if (!loopWait) {
        running = false
        return
      }
    }

    if (token !== runId) {
      running = false
      return
    }

    setStatus('replaying...')
    replayTimer = scheduleTimeout(() => {
      void run()
    }, reducedMotion ? 1200 : 2200)
    running = false
  }

  replayButton.addEventListener('click', () => {
    void run()
  })

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      if (!running) {
        void run()
      }
      return
    }

    runId += 1
    stopReplayTimer()
    clearPendingTimeouts()
    setStatus('paused')
  })

  void run()
}

initializeImmersiveDemo()
