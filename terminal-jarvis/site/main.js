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

const showReadyMessage = () => {
  if (releaseNoteLabel) {
    releaseNoteLabel.textContent = 'Release artifacts detected. Download buttons now point to the latest assets.'
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
      showReadyMessage()
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
