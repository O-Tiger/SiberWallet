/**
 * NexusMail → SiberWallet Integration
 *
 * Drop this script before </body> in SiberWallet's index.html:
 *   <script src="nexusmail.js"></script>
 *
 * Set NEXUSMAIL_API to your deployed backend URL (Railway, Render, etc).
 */

;(function () {
  'use strict'

  // ---------------------------------------------------------------------------
  // Config — update NEXUSMAIL_API to your Railway / Render URL
  // ---------------------------------------------------------------------------
  const NEXUSMAIL_API = localStorage.getItem('nm_api_url') || 'http://localhost:3000'
  const TOKEN_KEY = 'nm_access_token'
  const REFRESH_KEY = 'nm_refresh_token'

  // ---------------------------------------------------------------------------
  // Auth helpers
  // ---------------------------------------------------------------------------
  function getToken() { return localStorage.getItem(TOKEN_KEY) }
  function setTokens(access, refresh) {
    localStorage.setItem(TOKEN_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  }
  function clearTokens() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
  }

  async function apiFetch(path, options = {}) {
    const token = getToken()
    const res = await fetch(NEXUSMAIL_API + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    })

    // Auto-refresh on 401
    if (res.status === 401) {
      const refreshToken = localStorage.getItem(REFRESH_KEY)
      if (refreshToken) {
        const rr = await fetch(NEXUSMAIL_API + '/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (rr.ok) {
          const rd = await rr.json()
          setTokens(rd.accessToken, rd.refreshToken)
          return apiFetch(path, options) // retry
        }
      }
      clearTokens()
      renderLoginOverlay()
      throw new Error('Unauthorized')
    }

    if (!res.ok) throw new Error(`API error ${res.status}`)
    return res.json()
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------
  function fmt(amount, currency = 'BRL') {
    return amount.toLocaleString('pt-BR', { style: 'currency', currency })
  }

  function setText(selector, text, fallback = '') {
    const el = document.querySelector(selector)
    if (el) el.textContent = text || fallback
  }

  function setAll(selector, text) {
    document.querySelectorAll(selector).forEach((el) => (el.textContent = text))
  }

  // ---------------------------------------------------------------------------
  // Render summary data into SiberWallet DOM
  // ---------------------------------------------------------------------------
  function renderSummary(data) {
    // Balance cards — h3.fw-bold elements (3 cards: total balance, income, expenses)
    const h3s = document.querySelectorAll('.balance-card h3.fw-bold')
    if (h3s[0]) h3s[0].textContent = fmt(data.last30Days.income - data.last30Days.expenses)
    if (h3s[1]) h3s[1].textContent = fmt(data.last30Days.income)
    if (h3s[2]) h3s[2].textContent = fmt(data.last30Days.expenses)

    // Pending / overdue badges
    const smalls = document.querySelectorAll('.balance-card small')
    if (smalls[0]) {
      smalls[0].textContent = `${data.pending.count} pending · ${fmt(data.pending.total)}`
      smalls[0].className = data.overdue.count > 0 ? 'text-danger' : 'text-success'
    }

    // Transaction list
    const list = document.querySelector('.transaction-list')
    if (list && data.recent && data.recent.length > 0) {
      list.innerHTML = data.recent
        .slice(0, 8)
        .map((entry) => {
          const isIncome = entry.type === 'receivable'
          const date = new Date(entry.dueDate || entry.createdAt)
          return `
            <div class="transaction-item d-flex justify-content-between align-items-center py-2 border-bottom">
              <div>
                <div class="fw-semibold" style="font-size:0.875rem">${entry.description || entry.paymentSource || entry.category || '—'}</div>
                <small class="text-muted">${date.toLocaleDateString('pt-BR')} · ${entry.paymentSource || entry.status}</small>
              </div>
              <span class="transaction-amount fw-bold ${isIncome ? 'text-success' : 'text-danger'}">
                ${isIncome ? '+' : '-'}${fmt(Number(entry.amount), entry.currency)}
              </span>
            </div>`
        })
        .join('')
    }

    // Upcoming / overdue indicator
    if (data.overdue.count > 0) {
      const alert = document.createElement('div')
      alert.id = 'nm-overdue-alert'
      alert.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;background:#dc3545;color:#fff;padding:0.5rem 1rem;border-radius:8px;font-size:0.85rem;box-shadow:0 4px 12px rgba(0,0,0,.3)'
      alert.textContent = `⚠ ${data.overdue.count} overdue payment${data.overdue.count > 1 ? 's' : ''} · ${fmt(data.overdue.total)}`
      document.body.appendChild(alert)
      setTimeout(() => alert.remove(), 8000)
    }

    // Connected accounts badge
    if (data.connectedAccounts && data.connectedAccounts.length > 0) {
      const badge = document.getElementById('nm-accounts-badge') || document.createElement('div')
      badge.id = 'nm-accounts-badge'
      badge.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:9998;background:#1a1a2e;color:#a78bfa;border:1px solid #4c1d95;padding:0.4rem 0.8rem;border-radius:8px;font-size:0.75rem'
      badge.textContent = `NexusMail: ${data.connectedAccounts.map((c) => c.provider).join(', ')} connected`
      document.body.appendChild(badge)
    }
  }

  // ---------------------------------------------------------------------------
  // Login overlay (shown when not authenticated)
  // ---------------------------------------------------------------------------
  function renderLoginOverlay() {
    if (document.getElementById('nm-login-overlay')) return

    const overlay = document.createElement('div')
    overlay.id = 'nm-login-overlay'
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.75);
      display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)`
    overlay.innerHTML = `
      <div style="background:#1e1e2e;border:1px solid #4c1d95;border-radius:12px;padding:2rem;width:360px;color:#fff">
        <h5 style="margin:0 0 0.5rem;color:#a78bfa">Connect NexusMail</h5>
        <p style="font-size:0.8rem;color:#888;margin-bottom:1.5rem">Sign in to load your financial data.</p>
        <div id="nm-login-error" style="color:#f87171;font-size:0.8rem;margin-bottom:0.75rem;display:none"></div>
        <label style="font-size:0.75rem;color:#aaa">API URL</label>
        <input id="nm-api-url" type="text" value="${NEXUSMAIL_API}"
          style="width:100%;padding:0.5rem;margin:0.25rem 0 0.75rem;background:#111;border:1px solid #333;border-radius:6px;color:#fff;font-size:0.85rem;box-sizing:border-box" />
        <label style="font-size:0.75rem;color:#aaa">Email</label>
        <input id="nm-email" type="email" placeholder="you@example.com"
          style="width:100%;padding:0.5rem;margin:0.25rem 0 0.75rem;background:#111;border:1px solid #333;border-radius:6px;color:#fff;font-size:0.85rem;box-sizing:border-box" />
        <label style="font-size:0.75rem;color:#aaa">Password</label>
        <input id="nm-password" type="password"
          style="width:100%;padding:0.5rem;margin:0.25rem 0 1rem;background:#111;border:1px solid #333;border-radius:6px;color:#fff;font-size:0.85rem;box-sizing:border-box" />
        <button id="nm-login-btn"
          style="width:100%;padding:0.6rem;background:#7c3aed;border:none;border-radius:6px;color:#fff;font-size:0.875rem;cursor:pointer;font-weight:600">
          Sign in
        </button>
      </div>`

    document.body.appendChild(overlay)

    document.getElementById('nm-login-btn').addEventListener('click', async () => {
      const apiUrl = document.getElementById('nm-api-url').value.trim().replace(/\/$/, '')
      const email = document.getElementById('nm-email').value.trim()
      const password = document.getElementById('nm-password').value
      const errEl = document.getElementById('nm-login-error')
      errEl.style.display = 'none'

      try {
        const res = await fetch(apiUrl + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        if (!res.ok) throw new Error('Invalid credentials')
        const data = await res.json()
        localStorage.setItem('nm_api_url', apiUrl)
        setTokens(data.accessToken, data.refreshToken)
        overlay.remove()
        init()
      } catch (err) {
        errEl.textContent = err.message || 'Login failed'
        errEl.style.display = 'block'
      }
    })
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  async function init() {
    if (!getToken()) {
      renderLoginOverlay()
      return
    }

    try {
      const summary = await apiFetch('/api/finances/summary')
      renderSummary(summary)
    } catch {
      // apiFetch already handles 401 → shows login overlay
    }
  }

  // Add a small "Refresh" button to the page
  function addRefreshButton() {
    const btn = document.createElement('button')
    btn.id = 'nm-refresh-btn'
    btn.textContent = '↻ NexusMail'
    btn.style.cssText = 'position:fixed;bottom:1rem;left:1rem;z-index:9998;background:#111;color:#a78bfa;border:1px solid #4c1d95;padding:0.35rem 0.75rem;border-radius:6px;font-size:0.75rem;cursor:pointer'
    btn.addEventListener('click', init)
    document.body.appendChild(btn)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { addRefreshButton(); init() })
  } else {
    addRefreshButton()
    init()
  }
})()
