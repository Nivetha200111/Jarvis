const downloadButton = document.getElementById('recommended-download')
const detectedOsLabel = document.getElementById('detected-os')

const releaseLinks = {
  linux: 'https://github.com/Nivetha200111/Jarvis/releases/latest/download/terminal-jarvis-linux-x64.tar.gz',
  windows: 'https://github.com/Nivetha200111/Jarvis/releases/latest/download/terminal-jarvis-windows-x64.zip',
  fallback: 'https://github.com/Nivetha200111/Jarvis/releases/latest'
}

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

const os = detectOs()

if (downloadButton && detectedOsLabel) {
  if (os === 'windows') {
    downloadButton.href = releaseLinks.windows
    downloadButton.textContent = 'Download for Windows'
    detectedOsLabel.textContent = 'Detected OS: Windows'
  } else if (os === 'linux') {
    downloadButton.href = releaseLinks.linux
    downloadButton.textContent = 'Download for Linux'
    detectedOsLabel.textContent = 'Detected OS: Linux'
  } else {
    downloadButton.href = releaseLinks.fallback
    downloadButton.textContent = 'Open Latest Release'
    detectedOsLabel.textContent = 'Detected OS: Unsupported/Unknown (use release page)'
  }
}
