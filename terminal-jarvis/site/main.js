import { siteConfig } from './site-config.js'

const releasePageUrl = 'https://github.com/Nivetha200111/Jarvis/releases'
const latestReleaseApi = 'https://api.github.com/repos/Nivetha200111/Jarvis/releases/latest'

const recommendedDownloadButton = document.getElementById('recommended-download')
const linuxDownloadButton = document.getElementById('linux-download')
const windowsDownloadButton = document.getElementById('windows-download')
const detectedOsLabel = document.getElementById('detected-os')
const releaseNoteLabel = document.getElementById('release-note')
const freePlanName = document.getElementById('free-plan-name')
const freePlanPrice = document.getElementById('free-plan-price')
const proPlanName = document.getElementById('pro-plan-name')
const proPlanPrice = document.getElementById('pro-plan-price')
const proPlanDescription = document.getElementById('pro-plan-description')
const paymentCheckoutButton = document.getElementById('payment-checkout')
const paymentStatusLabel = document.getElementById('payment-status')
const paymentRailLabel = document.getElementById('payment-rail-label')
const paymentUpiIdLabel = document.getElementById('payment-upi-id')
const copyUpiIdButton = document.getElementById('copy-upi-id')
const accessForm = document.getElementById('beta-access-form')
const accessNameInput = document.getElementById('beta-access-name')
const accessEmailInput = document.getElementById('beta-access-email')
const accessReferenceInput = document.getElementById('beta-access-reference')
const accessNotesInput = document.getElementById('beta-access-notes')
const accessSubmitButton = document.getElementById('beta-access-submit')
const supportLink = document.getElementById('support-link')

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

const isMobileDevice = () => /android|iphone|ipad|ipod/i.test(window.navigator.userAgent)

const buildUpiLink = ({ upiId, payeeName, amountInr, planName }) => {
  if (!upiId) {
    return ''
  }

  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName || 'Jarvis',
    tn: `${planName} beta seat`,
    cu: 'INR'
  })

  if (amountInr) {
    params.set('am', amountInr)
  }

  return `upi://pay?${params.toString()}`
}

const setPaymentButtonDisabled = (disabled) => {
  if (!paymentCheckoutButton) {
    return
  }

  paymentCheckoutButton.setAttribute('aria-disabled', disabled ? 'true' : 'false')
  paymentCheckoutButton.classList.toggle('btn-disabled', disabled)
}

const buildAccessRequestMailto = ({ monetization, name, email, reference, notes }) => {
  const subject = `Jarvis ${monetization.proPlanName} access request`
  const bodyLines = [
    `Plan: ${monetization.proPlanName}`,
    `Payment rail: ${monetization.paymentRailLabel || 'GPay / UPI'}`,
    `Name: ${name || '-'}`,
    `Email: ${email || '-'}`,
    `Payment reference: ${reference || '-'}`,
    '',
    'Notes:',
    notes || '-'
  ]

  return `mailto:${encodeURIComponent(monetization.betaAccessEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(bodyLines.join('\n'))}`
}

const configureMonetization = () => {
  const monetization = siteConfig?.monetization
  if (!monetization) {
    return
  }

  if (freePlanName) {
    freePlanName.textContent = monetization.freePlanName
  }
  if (freePlanPrice) {
    freePlanPrice.textContent = monetization.freePlanPrice
  }
  if (proPlanName) {
    proPlanName.textContent = monetization.proPlanName
  }
  if (proPlanPrice) {
    proPlanPrice.textContent = monetization.proPlanPrice
  }
  if (proPlanDescription) {
    proPlanDescription.textContent = monetization.proPlanDescription
  }
  if (supportLink && monetization.supportUrl) {
    supportLink.href = monetization.supportUrl
  }

  if (paymentRailLabel && monetization.paymentRailLabel) {
    paymentRailLabel.textContent = monetization.paymentRailLabel
  }

  const upiId = monetization.upiId?.trim() ?? ''
  const gpayPaymentLink = monetization.gpayPaymentLink?.trim() ?? ''
  const amountInr = monetization.upiAmountInr?.trim() ?? ''
  const payeeName = monetization.upiPayeeName?.trim() ?? ''
  const upiLink = buildUpiLink({
    upiId,
    payeeName,
    amountInr,
    planName: monetization.proPlanName
  })

  if (paymentUpiIdLabel) {
    paymentUpiIdLabel.textContent = upiId || 'Configure in site/site-config.js'
  }

  if (!paymentCheckoutButton || !paymentStatusLabel) {
    return
  }

  paymentCheckoutButton.textContent = monetization.proPlanCta
  paymentCheckoutButton.removeAttribute('target')
  paymentCheckoutButton.removeAttribute('rel')
  paymentCheckoutButton.onclick = null

  if (gpayPaymentLink) {
    paymentCheckoutButton.href = gpayPaymentLink
    paymentCheckoutButton.target = '_blank'
    paymentCheckoutButton.rel = 'noreferrer'
    setPaymentButtonDisabled(false)
    paymentStatusLabel.textContent = 'Live paid beta link enabled. Pay in GPay / UPI, then submit your access request below.'
  } else if (upiId && isMobileDevice() && upiLink) {
    paymentCheckoutButton.href = upiLink
    setPaymentButtonDisabled(false)
    paymentStatusLabel.textContent = 'Mobile device detected. The payment button opens your UPI app directly.'
  } else if (upiId) {
    paymentCheckoutButton.href = '#pricing'
    setPaymentButtonDisabled(false)
    paymentStatusLabel.textContent = 'Desktop detected. Use Copy UPI ID, pay in GPay / any UPI app, then submit your access request below.'
    paymentCheckoutButton.onclick = (event) => {
      event.preventDefault()
      copyUpiIdButton?.click()
    }
  } else {
    paymentCheckoutButton.href = '#pricing'
    setPaymentButtonDisabled(true)
    paymentStatusLabel.innerHTML = 'Set <code>gpayPaymentLink</code> or <code>upiId</code> in <code>site/site-config.js</code> to turn on the paid beta CTA.'
  }

  if (copyUpiIdButton) {
    copyUpiIdButton.disabled = !upiId
    copyUpiIdButton.classList.toggle('btn-disabled', !upiId)
    copyUpiIdButton.addEventListener('click', async () => {
      if (!upiId) {
        paymentStatusLabel.textContent = 'Add a real UPI ID in site/site-config.js before using the paid beta CTA.'
        return
      }

      try {
        await navigator.clipboard.writeText(upiId)
        paymentStatusLabel.textContent = `UPI ID copied: ${upiId}. Pay the beta seat amount, then submit your access request below.`
      } catch {
        paymentStatusLabel.textContent = `Copy failed. Use this UPI ID manually: ${upiId}`
      }
    })
  }

  if (accessForm && accessSubmitButton) {
    accessSubmitButton.textContent = monetization.betaAccessCta || 'I paid, request access'
    accessForm.addEventListener('submit', (event) => {
      event.preventDefault()

      const name = accessNameInput instanceof HTMLInputElement ? accessNameInput.value.trim() : ''
      const email = accessEmailInput instanceof HTMLInputElement ? accessEmailInput.value.trim() : ''
      const reference = accessReferenceInput instanceof HTMLInputElement ? accessReferenceInput.value.trim() : ''
      const notes = accessNotesInput instanceof HTMLTextAreaElement ? accessNotesInput.value.trim() : ''

      if (!reference) {
        paymentStatusLabel.textContent = 'Add your payment reference before requesting access.'
        return
      }

      if (monetization.betaAccessEmail?.trim()) {
        window.location.href = buildAccessRequestMailto({
          monetization,
          name,
          email,
          reference,
          notes
        })
        paymentStatusLabel.textContent = 'Opening a prefilled access request email. Send it after attaching your payment proof if needed.'
        return
      }

      if (supportLink?.href) {
        window.open(supportLink.href, '_blank', 'noreferrer')
        paymentStatusLabel.textContent = 'No access email is configured yet. Opened the support link instead.'
        return
      }

      paymentStatusLabel.textContent = 'Set betaAccessEmail in site/site-config.js to enable the access request flow.'
    })
  }
}

configureMonetization()

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
  const demoTimings = reducedMotion
    ? {
        inputCharMs: 0,
        streamWhitespaceMs: 0,
        streamWordMs: 0,
        contextPauseMs: 120,
        stepPauseMs: 180,
        replayPauseMs: 1200
      }
    : {
        inputCharMs: 34,
        streamWhitespaceMs: 24,
        streamWordMs: 96,
        contextPauseMs: 1100,
        stepPauseMs: 1700,
        replayPauseMs: 3800
      }
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
      const stillCurrent = await wait(demoTimings.inputCharMs, token)
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
      const stillCurrent = await wait(
        chunk.trim().length === 0 ? demoTimings.streamWhitespaceMs : demoTimings.streamWordMs,
        token
      )
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
      const contextWait = await wait(demoTimings.contextPauseMs, token)
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
      const loopWait = await wait(demoTimings.stepPauseMs, token)
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
    }, demoTimings.replayPauseMs)
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
