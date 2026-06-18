/**
 * quiz.js - GH-300 共用測驗引擎
 * 負責渲染題目、即時判題、進度追蹤、重置功能
 */

// ── 動態背景粒子 ──────────────────────────────────
;(function initBg() {
  const canvas = document.getElementById('bg-canvas')
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const COLORS = ['#58a6ff55', '#a371f744', '#f0883e33', '#3fb95033']
  let W, H, particles

  function resize() {
    W = canvas.width = window.innerWidth
    H = canvas.height = window.innerHeight
  }

  function mkParticles() {
    particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 2 + 0.5,
      dx: (Math.random() - 0.5) * 0.35,
      dy: (Math.random() - 0.5) * 0.35,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]
    }))
  }

  function draw() {
    ctx.clearRect(0, 0, W, H)
    particles.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = p.color; ctx.fill()
      p.x += p.dx; p.y += p.dy
      if (p.x < 0 || p.x > W) p.dx *= -1
      if (p.y < 0 || p.y > H) p.dy *= -1
    })
    requestAnimationFrame(draw)
  }

  resize(); mkParticles(); draw()
  window.addEventListener('resize', () => { resize(); mkParticles() })
})()

// ── 測驗狀態 ──────────────────────────────────────
let _data = []
let _answered = {} // id -> { correct: bool, selected: [] }
let _total = 0

/**
 * 初始化測驗
 * @param {Array} data - 題目陣列
 * @param {string} topicLabel - 章節名稱（用於顯示）
 * @param {number} total - 題目總數
 */
function initQuiz(data, topicLabel, total) {
  _data = data
  _total = total
  _answered = {}
  render()
}

/** 渲染所有題目 */
function render() {
  const container = document.getElementById('quiz-container')
  container.innerHTML = ''
  _data.forEach((q, idx) => {
    container.appendChild(buildCard(q, idx))
  })
  updateProgress()
}

/**
 * 建立單一題目卡片
 * @param {object} q - 題目資料
 * @param {number} idx - 索引
 * @returns {HTMLElement}
 */
function buildCard(q, idx) {
  const card = document.createElement('div')
  card.className = 'question-card'
  card.id = `card-${q.id}`

  const isMultiple = q.type === 'multiple'
  const typeBadge = isMultiple
    ? `<span class="question-type-badge multiple">多選題</span>`
    : `<span class="question-type-badge single">單選題</span>`

  // 題號列
  const numRow = document.createElement('div')
  numRow.className = 'question-num'
  numRow.innerHTML = `Q${idx + 1} ${typeBadge}`
  card.appendChild(numRow)

  // 題目文字
  const qText = document.createElement('p')
  qText.className = 'question-text'
  qText.textContent = q.question
  card.appendChild(qText)

  // 選項列
  const optList = document.createElement('div')
  optList.className = 'options-list'
  optList.id = `opts-${q.id}`

  Object.entries(q.options).forEach(([key, text]) => {
    const label = document.createElement('label')
    label.className = 'option-label'
    label.setAttribute('data-key', key)
    label.htmlFor = `${q.id}-${key}`

    const input = document.createElement('input')
    input.type = isMultiple ? 'checkbox' : 'radio'
    input.name = q.id
    input.id = `${q.id}-${key}`
    input.value = key
    input.addEventListener('change', () => onOptionChange(q))

    const keySpan = document.createElement('span')
    keySpan.className = 'option-key'
    keySpan.textContent = key

    const textSpan = document.createElement('span')
    textSpan.className = 'option-text'
    textSpan.textContent = text

    label.append(input, keySpan, textSpan)
    optList.appendChild(label)
  })
  card.appendChild(optList)

  // 多選題：提交按鈕
  if (isMultiple) {
    const btn = document.createElement('button')
    btn.className = 'submit-btn'
    btn.id = `submit-${q.id}`
    btn.textContent = '✓ 確認答案'
    btn.onclick = () => judgeMultiple(q)
    card.appendChild(btn)
  }

  // 回饋訊息區
  const feedback = document.createElement('div')
  feedback.className = 'feedback-msg'
  feedback.id = `feedback-${q.id}`
  card.appendChild(feedback)

  // 若已作答，恢復狀態
  if (_answered[q.id]) {
    restoreState(q, card)
  }

  return card
}

/**
 * 單選題：選項改變時立即判題
 * @param {object} q
 */
function onOptionChange(q) {
  if (_answered[q.id]) return  // 已作答不重複判題
  if (q.type === 'single') {
    judgeSingle(q)
  }
  // 多選題等待提交
}

/**
 * 判斷單選題
 * @param {object} q
 */
function judgeSingle(q) {
  const selected = getSelected(q.id)
  if (!selected.length) return
  _answered[q.id] = { correct: arrEq(selected, q.answer), selected }
  applyFeedback(q)
  updateProgress()
  checkComplete()
}

/**
 * 判斷多選題
 * @param {object} q
 */
function judgeMultiple(q) {
  const selected = getSelected(q.id)
  if (!selected.length) { alert('請至少選擇一個選項'); return }
  _answered[q.id] = { correct: arrEq(selected, q.answer), selected }
  applyFeedback(q)
  updateProgress()
  checkComplete()
}

/**
 * 套用回饋樣式與訊息
 * @param {object} q
 */
function applyFeedback(q) {
  const state = _answered[q.id]
  const optList = document.getElementById(`opts-${q.id}`)
  const feedback = document.getElementById(`feedback-${q.id}`)
  const submitBtn = document.getElementById(`submit-${q.id}`)

  // 鎖定所有選項
  optList.querySelectorAll('.option-label').forEach(label => {
    label.classList.add('disabled-opt')
    const key = label.getAttribute('data-key')
    const isCorrect = q.answer.includes(key)
    const isSelected = state.selected.includes(key)

    if (isCorrect) {
      label.classList.add('correct')
    } else if (isSelected && !isCorrect) {
      label.classList.add('wrong')
    }
  })

  // 隱藏提交按鈕
  if (submitBtn) submitBtn.style.display = 'none'

  // 顯示回饋訊息
  if (state.correct) {
    feedback.className = 'feedback-msg correct-msg show'
    feedback.textContent = '✅ 答對了！'
  } else {
    const correctText = q.answer.map(k => `${k}: ${q.options[k]}`).join('、')
    feedback.className = 'feedback-msg wrong-msg show'
    feedback.textContent = `❌ 答錯了！正確答案：${correctText}`
  }
}

/**
 * 恢復已作答題目的狀態（頁面重渲染時使用）
 * @param {object} q
 * @param {HTMLElement} card
 */
function restoreState(q, card) {
  const state = _answered[q.id]
  const optList = card.querySelector('.options-list')
  const submitBtn = card.querySelector('.submit-btn')

  // 恢復勾選
  state.selected.forEach(key => {
    const input = card.querySelector(`#${q.id}-${key}`)
    if (input) input.checked = true
  })

  // 套用鎖定與顏色
  optList.querySelectorAll('.option-label').forEach(label => {
    label.classList.add('disabled-opt')
    const key = label.getAttribute('data-key')
    const isCorrect = q.answer.includes(key)
    const isSelected = state.selected.includes(key)
    if (isCorrect) label.classList.add('correct')
    else if (isSelected) label.classList.add('wrong')
  })

  if (submitBtn) submitBtn.style.display = 'none'

  const feedback = card.querySelector('.feedback-msg')
  if (state.correct) {
    feedback.className = 'feedback-msg correct-msg show'
    feedback.textContent = '✅ 答對了！'
  } else {
    const correctText = q.answer.map(k => `${k}: ${q.options[k]}`).join('、')
    feedback.className = 'feedback-msg wrong-msg show'
    feedback.textContent = `❌ 答錯了！正確答案：${correctText}`
  }
}

/** 更新進度條 */
function updateProgress() {
  const done = Object.keys(_answered).length
  const pct = _total > 0 ? (done / _total * 100).toFixed(0) : 0
  const bar = document.getElementById('progress-bar')
  const txt = document.getElementById('progress-text')
  if (bar) bar.style.width = pct + '%'
  if (txt) txt.textContent = `${done} / ${_total} 已作答`
}

/** 全部作答完成後顯示分數 */
function checkComplete() {
  const done = Object.keys(_answered).length
  if (done < _total) return
  const correct = Object.values(_answered).filter(v => v.correct).length
  showScore(correct, _total)
}

/**
 * 顯示分數摘要
 * @param {number} correct
 * @param {number} total
 */
function showScore(correct, total) {
  let summary = document.getElementById('score-summary')
  if (!summary) {
    summary = document.createElement('div')
    summary.id = 'score-summary'
    summary.className = 'score-summary show'
    document.getElementById('quiz-container').appendChild(summary)
  } else {
    summary.className = 'score-summary show'
  }
  const pct = Math.round(correct / total * 100)
  const emoji = pct >= 80 ? '🎉' : pct >= 60 ? '💪' : '📖'
  summary.innerHTML = `
    <div class="score-big">${pct}%</div>
    <div class="score-label">${emoji} 共 ${total} 題，答對 ${correct} 題</div>
  `
  summary.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

/** 重置測驗 */
function resetQuiz() {
  _answered = {}
  render()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

// ── 工具函式 ──────────────────────────────────────

/**
 * 取得指定題目已勾選的選項 keys（排序後）
 * @param {string} id
 * @returns {string[]}
 */
function getSelected(id) {
  return [...document.querySelectorAll(`input[name="${id}"]:checked`)]
    .map(el => el.value)
    .sort()
}

/**
 * 比較兩陣列是否完全相同（已排序）
 * @param {string[]} a
 * @param {string[]} b
 * @returns {boolean}
 */
function arrEq(a, b) {
  const sa = [...a].sort(), sb = [...b].sort()
  return sa.length === sb.length && sa.every((v, i) => v === sb[i])
}
