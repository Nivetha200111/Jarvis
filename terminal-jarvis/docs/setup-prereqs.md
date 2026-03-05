# Setup Prerequisites

## Required Runtime

- Node.js 22.x (LTS)
- npm 10+

## Required Native Tooling (Linux)

For CachyOS/Arch:

```bash
sudo pacman -S --needed git python make gcc cmake pkgconf
```

## Required Native Tooling (Windows)

- Git for Windows
- Python 3.11+
- CMake
- Visual Studio Build Tools (Desktop development with C++)

Recommended install commands:

```powershell
winget install Git.Git Python.Python.3.11 Kitware.CMake
```

## Verify Prerequisites

```bash
node -v
npm -v
git --version
python3 --version
make --version
g++ --version
cmake --version
pkg-config --version
```

For Windows verify:

```powershell
node -v
npm -v
git --version
python --version
cmake --version
cl
```

## Notes

- `cmake` is required before integrating real `node-llama-cpp` bindings.
- Baseline setup uses a mock inference adapter and runs fully local/offline.
