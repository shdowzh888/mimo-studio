// 全局错误捕获 — 在黑屏时至少能看到错误信息
// 提取自 index.html 内联脚本：CSP 的 script-src 'self' 不允许内联脚本，故外置为独立文件。
// 必须保持普通脚本（非 module）且在 head 中同步执行 —— React 加载前先挂上钩子。
window.__MIMO_ERRORS__ = []
function showError(msg) {
  window.__MIMO_ERRORS__.push(msg)
  var el = document.getElementById('mimo-error')
  el.style.display = 'block'
  el.textContent = window.__MIMO_ERRORS__.join('\n')
  var load = document.getElementById('mimo-loading')
  if (load) load.style.display = 'none'
}
window.addEventListener('error', function(e) {
  showError((e.target.tagName || '') + ' ' + (e.target.src || e.target.href || '') + ' ' + (e.message || 'load failed'))
}, true)
window.onerror = function(msg, src, line, col, err) {
  showError('JS Error: ' + msg + '\n  at ' + src + ':' + line + ':' + col)
}
// 3秒后如果 React 还没渲染（root 还是空的），显示诊断信息
setTimeout(function() {
  var root = document.getElementById('root')
  if (root && root.children.length === 0) {
    showError('React 未渲染 — root 元素为空\nUserAgent: ' + navigator.userAgent)
  }
}, 3000)
