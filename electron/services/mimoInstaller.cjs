// MiMo CLI 检测 + 安装服务
// 安装策略（按优先级）：
// 1. 检测 PATH 中是否已有 mimo（任何来源）
// 2. 检测 ~/.mimocode/bin/mimo（curl 安装脚本位置）
// 3. 都没有 → 从 app 内置 CLI 拷贝（秒装，无需网络）
// 4. 内置不可用 → 从本项目自有 Gitee release 下载（CI 发版时从上游转存，国内快）
// 5. 自有码云资产缺失 → GitHub Releases（国际网络）
// 6. 都失败 → npm 装到用户目录再提取平台二进制（无需全局写权限）

const { exec, execFile, execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')
const crypto = require('crypto')
const { createWriteStream, mkdirSync, existsSync, rmSync } = require('fs')
const { getMimoDataDir } = require('./database.cjs')

// 下载源优先级：自有 Gitee release（CI 从上游转存的 CLI 归档，国内快）→ GitHub 上游（国际）
// 注意：官方镜像 gitee.com/mirrors/mimocode 只同步 git 数据、不同步 release 附件
// （实测全版本资产 404），不可作为下载源。
const SELF_GITEE_RELEASE_BASE = 'https://gitee.com/shdowzh/mimo-studio/releases/download'
const GITHUB_RELEASE_BASE = 'https://github.com/XiaomiMiMo/MiMo-Code/releases/latest/download'

// CLI 归档随应用发版由 CI 转存到同名 tag 的 release 下，因此自有码云源的 URL
// 只依赖应用自身版本（app.getVersion()）；上游 CLI 的具体版本在
// .github/workflows/release.yml 的 MIMO_CLI_VERSION 中固定。
function getAppTag() {
  try {
    const { app } = require('electron')
    return `v${app.getVersion()}`
  } catch {
    return null // 非 Electron 环境（单测等）取不到，跳过自有码云源
  }
}

/**
 * 根据当前平台获取预编译二进制的下载文件名
 */
function getAssetName() {
  const platform = os.platform()
  const arch = os.arch()

  if (platform === 'win32') {
    return arch === 'arm64' ? 'mimocode-windows-arm64.zip' : 'mimocode-windows-x64.zip'
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'mimocode-darwin-arm64.zip' : 'mimocode-darwin-x64.zip'
  } else {
    return arch === 'arm64' ? 'mimocode-linux-arm64.tar.gz' : 'mimocode-linux-x64.tar.gz'
  }
}

/**
 * 检测 mimo CLI 是否可用
 * 返回 { installed, version, path, source }
 */
function detect() {
  return new Promise((resolve) => {
    // timeout：PATH 中若存在挂死的同名 shim（杀软拦截/坏脚本），避免启动检测永久阻塞
    exec('mimo --version', { timeout: 5000 }, (error, stdout) => {
      if (!error && stdout.trim()) {
        resolve({ installed: true, version: stdout.trim(), source: 'path' })
        return
      }

      const binDir = path.join(getMimoDataDir(), 'bin')
      const isWin = os.platform() === 'win32'
      const binName = isWin ? 'mimo.exe' : 'mimo'
      const binPath = path.join(binDir, binName)

      if (existsSync(binPath)) {
        execFile(binPath, ['--version'], { timeout: 5000 }, (err2, stdout2) => {
          if (!err2 && stdout2.trim()) {
            resolve({ installed: true, version: stdout2.trim(), path: binPath, source: 'local-bin' })
          } else {
            resolve({ installed: false })
          }
        })
      } else {
        resolve({ installed: false })
      }
    })
  })
}

/**
 * 方式 0（最快）：从 app 内置 CLI 拷贝安装
 * app 打包时将对应平台的 mimo 二进制放在 cli/ 目录下
 */
function installFromBundled(eventSender) {
  return new Promise((resolve, reject) => {
    const sendProgress = (msg) => {
      if (eventSender && !eventSender.isDestroyed()) {
        eventSender.send('mimo:installProgress', { stdout: msg })
      }
    }

    const isWin = os.platform() === 'win32'
    const arch = os.arch()
    const binName = isWin ? 'mimo.exe' : 'mimo'

    // 内置 CLI 目录结构: cli/<platform>-<arch>/mimo
    const platformName = isWin ? 'windows' : os.platform() === 'darwin' ? 'darwin' : 'linux'
    const archName = arch === 'arm64' ? 'arm64' : 'x64'
    const bundledDir = path.join(__dirname, '../../cli', `${platformName}-${archName}`)
    const bundledBin = path.join(bundledDir, binName)

    if (!existsSync(bundledBin)) {
      reject(new Error('本平台无内置 CLI'))
      return
    }

    // 如果已安装，比较版本：已装版本 >= 内置版本则跳过
    const binDir = path.join(getMimoDataDir(), 'bin')
    const destPath = path.join(binDir, binName)
    if (existsSync(destPath)) {
      try {
        const existingVersion = execFileSync(destPath, ['--version']).toString().trim()
        // 内置 CLI 版本固定，如果已装的版本不为空就跳过（避免降级）
        if (existingVersion) {
          sendProgress('MiMo CLI 已安装，跳过')
          resolve()
          return
        }
      } catch {}
      // 已装但获取版本失败，可能是损坏的，继续覆盖安装
    }

    sendProgress('正在安装 MiMo CLI...')

    if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })

    try {
      fs.copyFileSync(bundledBin, destPath)
      if (!isWin) {
        fs.chmodSync(destPath, 0o755)
      }
      sendProgress('MiMo CLI 安装完成！')
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * 从指定 URL 下载并安装预编译二进制
 */
function installFromUrl(downloadUrl, eventSender) {
  return new Promise(async (resolve, reject) => {
    const assetName = getAssetName()
    const binDir = path.join(getMimoDataDir(), 'bin')
    const tempDir = path.join(getMimoDataDir(), '.tmp-install')

    const sendProgress = (msg) => {
      if (eventSender && !eventSender.isDestroyed()) {
        eventSender.send('mimo:installProgress', { stdout: msg })
      }
    }

    try {
      sendProgress(`正在下载 ${assetName}...`)

      if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })
      if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })

      const isWin = os.platform() === 'win32'
      const isZip = assetName.endsWith('.zip')
      const archivePath = path.join(tempDir, assetName)

      await downloadFile(downloadUrl, archivePath, (downloaded, total) => {
        if (total > 0) {
          const pct = Math.round(downloaded / total * 100)
          sendProgress(`下载中... ${pct}%`)
        }
      })

      // 阶段间隙自查取消标记：整体超时后不再浪费校验/解压/拷贝，避免覆盖 bin 目录
      if (installCancelled) throw new Error('已取消（整体超时）')

      // 完整性校验：比对同 release 下的 SHA256SUMS；不匹配则删除归档并拒绝解压执行
      await verifyArchiveIntegrity(archivePath, downloadUrl, assetName, sendProgress)

      if (installCancelled) throw new Error('已取消（整体超时）')
      sendProgress('下载完成，正在解压...')

      if (isZip) {
        await extractZip(archivePath, tempDir)
      } else {
        await extractTarGz(archivePath, tempDir)
      }

      if (installCancelled) throw new Error('已取消（整体超时）')

      const mimoBinName = isWin ? 'mimo.exe' : 'mimo'
      let mimoBinPath = findFile(tempDir, mimoBinName)

      if (!mimoBinPath) {
        const altBinName = isWin ? 'mimocode.exe' : 'mimocode'
        mimoBinPath = findFile(tempDir, altBinName)
      }

      if (!mimoBinPath) {
        throw new Error('下载包中未找到 mimo 可执行文件')
      }

      const destPath = path.join(binDir, mimoBinName)
      if (existsSync(destPath)) rmSync(destPath)

      copyFileSync(mimoBinPath, destPath)

      if (!isWin) {
        try { fs.chmodSync(destPath, 0o755) } catch {}
      }

      try { rmSync(tempDir, { recursive: true, force: true }) } catch {}

      sendProgress('MiMo CLI 安装完成！')
      resolve()
    } catch (err) {
      try { rmSync(tempDir, { recursive: true, force: true }) } catch {}
      reject(err)
    }
  })
}

/**
 * 在目录中递归查找文件
 */
function findFile(dir, fileName) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === fileName) return fullPath
    if (entry.isDirectory()) {
      const found = findFile(fullPath, fileName)
      if (found) return found
    }
  }
  return null
}

/**
 * npm 安装到用户目录再提取二进制（最后手段）
 * 不用 -g：Windows 全局目录通常需要管理员权限，普通用户必失败；
 * --prefix 装到数据目录后，从 @mimo-ai/mimocode-* 平台包中取出真实二进制。
 */
function installFromNpm(eventSender) {
  return new Promise((resolve, reject) => {
    const sendProgress = (msg) => {
      if (eventSender && !eventSender.isDestroyed()) {
        eventSender.send('mimo:installProgress', { stdout: msg })
      }
    }

    const isWin = os.platform() === 'win32'
    const cmd = isWin ? 'npm.cmd' : 'npm'
    const prefixDir = path.join(getMimoDataDir(), '.npm-cli')
    const binName = isWin ? 'mimo.exe' : 'mimo'

    try { mkdirSync(prefixDir, { recursive: true }) } catch {}

    // timeout：npm 网络卡死时兜底（外层 install() 另有整体 5 分钟 race）
    const child = exec(`${cmd} install --prefix "${prefixDir}" @mimo-ai/cli`, { timeout: 180000 }, (error) => {
      if (error) { reject(error); return }
      try {
        // 真实二进制在平台子包（@mimo-ai/mimocode-<platform>）里，cli 主包只有 JS shim
        const scopeDir = path.join(prefixDir, 'node_modules', '@mimo-ai')
        let binPath = null
        for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
          if (!entry.isDirectory() || !entry.name.startsWith('mimocode-')) continue
          const pkgDir = path.join(scopeDir, entry.name)
          const found = findFile(pkgDir, binName) || findFile(pkgDir, isWin ? 'mimocode.exe' : 'mimocode')
          // >1MB 才是原生二进制，排除误命中脚本文件
          if (found && fs.statSync(found).size > 1024 * 1024) { binPath = found; break }
        }
        if (!binPath) {
          reject(new Error('npm 安装完成但未找到平台二进制'))
          return
        }
        const binDir = path.join(getMimoDataDir(), 'bin')
        if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true })
        const destPath = path.join(binDir, binName)
        if (existsSync(destPath)) rmSync(destPath)
        copyFileSync(binPath, destPath)
        if (!isWin) { try { fs.chmodSync(destPath, 0o755) } catch {} }
        try { rmSync(prefixDir, { recursive: true, force: true }) } catch {}
        sendProgress('MiMo CLI 安装完成！')
        resolve()
      } catch (err) {
        reject(err)
      }
    })
    child.stdout?.on('data', (data) => {
      if (eventSender && !eventSender.isDestroyed()) {
        eventSender.send('mimo:installProgress', { stdout: data.toString() })
      }
    })
    child.stderr?.on('data', (data) => {
      if (eventSender && !eventSender.isDestroyed()) {
        eventSender.send('mimo:installProgress', { stderr: data.toString() })
      }
    })
  })
}

// 整体超时置位后，仍在跑的下载/解压链在阶段间隙自查此标记并中止，
// 避免 Promise.race 超时报错后僵尸任务继续解压、覆盖 bin 目录
let installCancelled = false

/**
 * 智能安装：内置 → 自有 Gitee release（重试2次）→ GitHub（重试2次）→ npm 用户目录
 * 整体超时 5 分钟
 */
async function install(eventSender) {
  const sendProgress = (msg) => {
    if (eventSender && !eventSender.isDestroyed()) {
      eventSender.send('mimo:installProgress', { stdout: msg })
    }
  }

  const INSTALL_TIMEOUT = 5 * 60 * 1000 // 5 分钟整体超时
  const PER_SOURCE_RETRIES = 2

  const installPromise = (async () => {
    // 1. 内置 CLI（秒装，无需网络）
    try {
      await installFromBundled(eventSender)
      return
    } catch (e) {
      // 无内置，继续
    }

    // 2. 自有 Gitee release（CI 发版时从上游转存的归档，国内快），重试 PER_SOURCE_RETRIES 次
    const assetName = getAssetName()
    const appTag = getAppTag()
    if (appTag) {
      const giteeUrl = `${SELF_GITEE_RELEASE_BASE}/${appTag}/${assetName}`
      for (let i = 0; i < PER_SOURCE_RETRIES; i++) {
        try {
          if (i > 0) sendProgress(`Gitee 重试 (${i + 1}/${PER_SOURCE_RETRIES})...`)
          await installFromUrl(giteeUrl, eventSender)
          return
        } catch (e) {
          console.log(`[installer] Gitee(${appTag}) attempt ${i + 1} failed: ${e.message}`)
          if (i < PER_SOURCE_RETRIES - 1) await sleep(2000)
        }
      }
    }

    // 3. GitHub 预编译二进制，重试 PER_SOURCE_RETRIES 次
    const githubUrl = `${GITHUB_RELEASE_BASE}/${assetName}`
    for (let i = 0; i < PER_SOURCE_RETRIES; i++) {
      try {
        if (i > 0) sendProgress(`GitHub 重试 (${i + 1}/${PER_SOURCE_RETRIES})...`)
        await installFromUrl(githubUrl, eventSender)
        return
      } catch (e) {
        console.log(`[installer] GitHub attempt ${i + 1} failed: ${e.message}`)
        if (i < PER_SOURCE_RETRIES - 1) await sleep(2000)
      }
    }

    // 4. npm 用户目录安装（最后手段，不重试）
    sendProgress('所有下载源均已尝试，正在通过 npm 安装...')
    await installFromNpm(eventSender)
  })()

  installCancelled = false // 新一轮安装开始，清除上一次的超时标记
  let timeoutId = null
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      installCancelled = true
      reject(new Error('安装超时（5分钟），请检查网络连接后重试'))
    }, INSTALL_TIMEOUT)
  })

  try {
    await Promise.race([installPromise, timeout])
  } catch (e) {
    sendProgress(e.message)
    throw e
  } finally {
    // 安装已完成或已失败 → 撤掉超时定时器，避免残留一个 5 分钟的挂起 timer
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 首次启动时自动静默安装
 */
async function autoInstallIfNeeded(mainWindow) {
  const result = await detect()
  if (result.installed) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mimo:status', result)
    }
    return
  }

  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mimo:status', { installed: false, installing: true })
    }
    await install(mainWindow)
    const afterInstall = await detect()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mimo:status', { ...afterInstall, justInstalled: true })
    }
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mimo:status', { installed: false, error: err.message })
    }
  }
}

// === 工具函数 ===

function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 10) { reject(new Error('Too many redirects')); return }

      const mod = currentUrl.startsWith('https') ? require('https') : require('http')
      const req = mod.get(currentUrl, { timeout: 60000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          follow(res.headers.location, redirectCount + 1)
          return
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return }

        const total = parseInt(res.headers['content-length'] || '0', 10)
        let downloaded = 0

        const file = createWriteStream(destPath)
        res.on('data', (chunk) => { downloaded += chunk.length; onProgress?.(downloaded, total) })
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
        file.on('error', reject)
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')) })
    }
    follow(url)
  })
}

// === 完整性校验 ===

// 流式分块计算文件 SHA256，避免大归档一次性占内存
function sha256File(filePath) {
  const h = crypto.createHash('sha256')
  const fd = fs.openSync(filePath, 'r')
  const buf = Buffer.alloc(64 * 1024)
  try {
    let bytes
    while ((bytes = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      h.update(buf.slice(0, bytes))
    }
  } finally {
    fs.closeSync(fd)
  }
  return h.digest('hex')
}

// GET 文本响应（跟随重定向），用于拉取 SHA256SUMS
function fetchText(url) {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl, redirects = 0) => {
      if (redirects > 10) { reject(new Error('Too many redirects')); return }
      const mod = currentUrl.startsWith('https') ? https : require('http')
      const req = mod.get(currentUrl, { timeout: 10000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          follow(res.headers.location, redirects + 1)
          return
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return }
        let body = ''
        res.setEncoding('utf-8')
        res.on('data', (c) => { body += c })
        res.on('end', () => resolve(body))
      })
      req.on('error', reject)
      req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')) })
    }
    follow(url)
  })
}

// 解析 SHA256SUMS：行格式 "<hash>  <filename>"，返回匹配 assetName 的哈希（小写）
function matchSumsEntry(sumsBody, assetName) {
  for (const line of sumsBody.split(/\r?\n/)) {
    const m = line.match(/^([0-9a-fA-F]{64})\s+\*?(\S+)\s*$/)
    if (m && (m[2] === assetName || m[2].endsWith('/' + assetName))) {
      return m[1].toLowerCase()
    }
  }
  return null
}

/**
 * 比对归档 SHA256 与同 release 目录下的 SHA256SUMS。
 * - sums 可用且资产被列出：不匹配 → 删归档并抛错，拒绝执行可能被篡改的二进制
 * - sums 不可用 / 资产未列出：记录计算出的哈希（warn）后放行
 *
 * fail-open 取舍：auto-install 场景下 fail-closed 会让无 sums 的版本完全无法安装；
 * 上游未必每版都附 sums，故"有则强校验、无则记日志放行"。
 */
async function verifyArchiveIntegrity(archivePath, downloadUrl, assetName, sendProgress) {
  const actual = sha256File(archivePath)
  const sumsUrl = downloadUrl.replace(/\/[^/]+$/, '/SHA256SUMS')

  let sumsBody = null
  try {
    sumsBody = await fetchText(sumsUrl)
  } catch (e) {
    sendProgress(`[warn] 未取到 SHA256SUMS (${e.message})，已记录哈希 ${actual}，跳过校验`)
    return
  }
  const expected = matchSumsEntry(sumsBody, assetName)
  if (!expected) {
    sendProgress(`[warn] SHA256SUMS 中无 ${assetName}，已记录哈希 ${actual}，跳过校验`)
    return
  }
  if (expected !== actual) {
    try { rmSync(archivePath, { force: true }) } catch {}
    const err = new Error(`SHA256 校验失败：期望 ${expected}，实际 ${actual} — 拒绝执行可能被篡改的二进制`)
    sendProgress(`[error] ${err.message}`)
    throw err
  }
  sendProgress(`SHA256 校验通过 (${actual.slice(0, 12)}…)`)
}

function extractZip(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    if (os.platform() === 'win32') {
      // 用 -LiteralPath 避免路径中特殊字符（单引号、#、$ 等）被 PowerShell 解释
      // 路径由 app 内部生成，不含用户输入，但防御性转义仍必要
      const escPath = archivePath.replace(/'/g, "''")
      const escDest = destDir.replace(/'/g, "''")
      const psCmd = `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${escPath}' -DestinationPath '${escDest}' -Force"`
      exec(psCmd, (error) => { if (error) reject(error); else resolve() })
    } else {
      exec(`unzip -o "${archivePath}" -d "${destDir}"`, (error) => { if (error) reject(error); else resolve() })
    }
  })
}

function extractTarGz(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    exec(`tar -xzf "${archivePath}" -C "${destDir}"`, (error) => { if (error) reject(error); else resolve() })
  })
}

function copyFileSync(src, dest) {
  const data = fs.readFileSync(src)
  fs.writeFileSync(dest, data)
}

/**
 * 静默安装（不依赖 BrowserWindow eventSender）
 * 用于 streaming.cjs 等后端调用场景，进度通过回调输出
 */
function installSilent(onProgress) {
  const emitter = {
    send: (channel, data) => {
      if (onProgress) onProgress(data)
    },
    isDestroyed: () => false,
  }
  return install(emitter)
}

module.exports = { detect, install, autoInstallIfNeeded, installSilent }
