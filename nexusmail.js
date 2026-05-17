;(function () {
  'use strict'

  const TOKEN_KEY = 'nm_access_token'
  const REFRESH_KEY = 'nm_refresh_token'
  const API_KEY = 'nm_api_url'
  const USER_KEY = 'nm_user_name'

  function getApiBase() {
    return (localStorage.getItem(API_KEY) || 'http://localhost:3000').replace(/\/$/, '')
  }
  function getToken() { return localStorage.getItem(TOKEN_KEY) }
  function setTokens(access, refresh) {
    localStorage.setItem(TOKEN_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  }
  function clearTokens() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_KEY)
    localStorage.removeItem(USER_KEY)
  }

  async function apiFetch(path, options = {}) {
    const res = await fetch(getApiBase() + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(options.headers || {}),
      },
    })

    if (res.status === 401) {
      const refreshToken = localStorage.getItem(REFRESH_KEY)
      if (refreshToken) {
        const rr = await fetch(getApiBase() + '/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
        if (rr.ok) {
          const rd = await rr.json()
          setTokens(rd.accessToken, rd.refreshToken)
          return apiFetch(path, options)
        }
      }
      clearTokens()
      renderLoginOverlay()
      throw new Error('Unauthorized')
    }

    if (!res.ok) throw new Error(`API error ${res.status}`)
    return res.json()
  }

  function fmt(amount, currency = 'BRL') {
    return Number(amount).toLocaleString('pt-BR', { style: 'currency', currency })
  }

  function categoryIcon(entry) {
    const isIncome = entry.type === 'receivable'
    const cat = (entry.category || '').toLowerCase()
    if (isIncome) return { icon: 'fa-arrow-down', bg: 'bg-success-subtle', color: 'text-success' }
    if (cat === 'payment') return { icon: 'fa-barcode', bg: 'bg-warning-subtle', color: 'text-warning' }
    if (cat === 'infra') return { icon: 'fa-bolt', bg: 'bg-warning-subtle', color: 'text-warning' }
    if (cat === 'social') return { icon: 'fa-users', bg: 'bg-primary-subtle', color: 'text-primary' }
    if (cat === 'promotion') return { icon: 'fa-tag', bg: 'bg-info-subtle', color: 'text-info' }
    return { icon: 'fa-shopping-bag', bg: 'bg-danger-subtle', color: 'text-danger' }
  }

  function setLoading(on) {
    const spinner = document.getElementById('nm-spinner')
    if (spinner) spinner.style.display = on ? 'flex' : 'none'
  }

  function renderSummary(data) {
    const h3s = document.querySelectorAll('.balance-card h3.fw-bold')
    const smalls = document.querySelectorAll('.balance-card small')
    const net = data.last30Days.income - data.last30Days.expenses

    if (h3s[0]) h3s[0].textContent = fmt(net)
    if (h3s[1]) h3s[1].textContent = fmt(data.last30Days.income)
    if (h3s[2]) h3s[2].textContent = fmt(data.last30Days.expenses)

    if (smalls[0]) {
      const hasOverdue = data.overdue.count > 0
      smalls[0].textContent = hasOverdue
        ? `${data.overdue.count} vencido(s) · ${fmt(data.overdue.total)}`
        : data.pending.count > 0
          ? `${data.pending.count} pendente(s) · ${fmt(data.pending.total)}`
          : 'Em dia'
      smalls[0].className = hasOverdue ? 'text-danger' : 'text-success'
    }
    if (smalls[1]) {
      smalls[1].innerHTML = '<i class="fas fa-arrow-up"></i> últimos 30 dias'
      smalls[1].className = 'text-success'
    }
    if (smalls[2]) {
      smalls[2].innerHTML = '<i class="fas fa-arrow-down"></i> últimos 30 dias'
      smalls[2].className = 'text-danger'
    }

    const nameEl = document.getElementById('nm-welcome-name')
    const storedName = localStorage.getItem(USER_KEY)
    if (nameEl && storedName) nameEl.textContent = storedName.split(' ')[0] + '!'

    const list = document.querySelector('.transaction-list')
    if (list && data.recent && data.recent.length > 0) {
      list.innerHTML = data.recent.slice(0, 8).map((entry) => {
        const isIncome = entry.type === 'receivable'
        const { icon, bg, color } = categoryIcon(entry)
        const date = new Date(entry.dueDate || entry.createdAt)
        const label = entry.description || entry.paymentSource || entry.category || '—'
        const sub = `${date.toLocaleDateString('pt-BR')} · ${entry.paymentSource || entry.status || ''}`
        return `
          <div class="transaction-item">
            <div class="transaction-icon ${bg}">
              <i class="fas ${icon} ${color}"></i>
            </div>
            <div class="transaction-details">
              <h6 class="mb-0">${label}</h6>
              <small class="text-muted">${sub}</small>
            </div>
            <div class="transaction-amount ${isIncome ? 'text-success' : 'text-danger'}">
              ${isIncome ? '+' : '-'} ${fmt(Number(entry.amount), entry.currency || 'BRL')}
            </div>
          </div>`
      }).join('')
    } else if (list) {
      list.innerHTML = '<p class="text-muted text-center small py-3">Nenhuma transação encontrada</p>'
    }

    const upcomingEl = document.getElementById('nm-upcoming-list')
    if (upcomingEl) {
      const items = (data.upcoming || []).slice(0, 4)
      if (items.length === 0) {
        upcomingEl.innerHTML = '<p class="text-muted text-center small">Sem pagamentos futuros</p>'
      } else {
        upcomingEl.innerHTML = items.map((entry) => {
          const due = new Date(entry.dueDate)
          const isLate = due < new Date() && entry.status !== 'paid'
          return `
            <div class="investment-item">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="investment-name" style="font-size:0.875rem">${entry.description || entry.category || '—'}</span>
                <span class="fw-bold ${isLate ? 'text-danger' : 'text-primary'}" style="font-size:0.875rem">${fmt(entry.amount, entry.currency || 'BRL')}</span>
              </div>
              <small class="${isLate ? 'text-danger' : 'text-muted'}">
                <i class="fas ${isLate ? 'fa-exclamation-circle' : 'fa-calendar'} me-1"></i>
                ${due.toLocaleDateString('pt-BR')} · ${entry.paymentSource || entry.status}
              </small>
            </div>`
        }).join('')
      }
    }

    if (data.overdue.count > 0 && !document.getElementById('nm-overdue-alert')) {
      const alert = document.createElement('div')
      alert.id = 'nm-overdue-alert'
      alert.style.cssText = 'position:fixed;top:1rem;right:1rem;z-index:9999;background:#dc3545;color:#fff;padding:0.5rem 1rem;border-radius:8px;font-size:0.85rem;box-shadow:0 4px 12px rgba(0,0,0,.3);cursor:pointer'
      alert.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i> ${data.overdue.count} vencido(s) · ${fmt(data.overdue.total)}`
      alert.onclick = () => alert.remove()
      document.body.appendChild(alert)
      setTimeout(() => alert?.remove(), 10000)
    }

    if (data.connectedAccounts && data.connectedAccounts.length > 0) {
      let badge = document.getElementById('nm-accounts-badge')
      if (!badge) {
        badge = document.createElement('div')
        badge.id = 'nm-accounts-badge'
        badge.style.cssText = 'position:fixed;bottom:3.5rem;right:1rem;z-index:9998;background:#1a1a2e;color:#a78bfa;border:1px solid #4c1d95;padding:0.4rem 0.8rem;border-radius:8px;font-size:0.75rem'
        document.body.appendChild(badge)
      }
      badge.innerHTML = `<i class="fas fa-link me-1"></i> ${data.connectedAccounts.map((c) => c.provider).join(', ')}`
    }
  }

  function renderLoginOverlay() {
    if (document.getElementById('nm-login-overlay')) return
    const overlay = document.createElement('div')
    overlay.id = 'nm-login-overlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)'
    overlay.innerHTML = `
      <div style="background:#1e1e2e;border:1px solid #4c1d95;border-radius:12px;padding:2rem;width:360px;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,0.5)">
        <h5 style="margin:0 0 0.25rem;color:#a78bfa;font-weight:700">Conectar NexusMail</h5>
        <p style="font-size:0.8rem;color:#888;margin-bottom:1.5rem">Entre para carregar seus dados financeiros.</p>
        <div id="nm-login-error" style="color:#f87171;font-size:0.8rem;margin-bottom:0.75rem;background:rgba(220,38,38,0.1);padding:0.5rem 0.75rem;border-radius:6px;display:none"></div>
        <label style="font-size:0.75rem;color:#aaa;font-weight:600">URL da API</label>
        <input id="nm-api-url" type="text" value="${getApiBase()}"
          style="width:100%;padding:0.5rem;margin:0.25rem 0 0.75rem;background:#111;border:1px solid #333;border-radius:6px;color:#fff;font-size:0.85rem;box-sizing:border-box" />
        <label style="font-size:0.75rem;color:#aaa;font-weight:600">Email</label>
        <input id="nm-email" type="email" placeholder="voce@exemplo.com"
          style="width:100%;padding:0.5rem;margin:0.25rem 0 0.75rem;background:#111;border:1px solid #333;border-radius:6px;color:#fff;font-size:0.85rem;box-sizing:border-box" />
        <label style="font-size:0.75rem;color:#aaa;font-weight:600">Senha</label>
        <input id="nm-password" type="password"
          style="width:100%;padding:0.5rem;margin:0.25rem 0 1rem;background:#111;border:1px solid #333;border-radius:6px;color:#fff;font-size:0.85rem;box-sizing:border-box" />
        <button id="nm-login-btn"
          style="width:100%;padding:0.6rem;background:#7c3aed;border:none;border-radius:6px;color:#fff;font-size:0.875rem;cursor:pointer;font-weight:600">
          Entrar
        </button>
      </div>`
    document.body.appendChild(overlay)

    const btn = document.getElementById('nm-login-btn')
    const errEl = document.getElementById('nm-login-error')
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click() })

    btn.addEventListener('click', async () => {
      const apiUrl = document.getElementById('nm-api-url').value.trim().replace(/\/$/, '')
      const email = document.getElementById('nm-email').value.trim()
      const password = document.getElementById('nm-password').value
      errEl.style.display = 'none'
      btn.disabled = true
      btn.textContent = 'Entrando...'
      try {
        const res = await fetch(apiUrl + '/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        })
        if (!res.ok) throw new Error('Credenciais inválidas')
        const data = await res.json()
        localStorage.setItem(API_KEY, apiUrl)
        setTokens(data.accessToken, data.refreshToken)
        const name = data.user?.name || email.split('@')[0]
        localStorage.setItem(USER_KEY, name)
        overlay.remove()
        init()
      } catch (err) {
        errEl.textContent = err.message || 'Falha no login'
        errEl.style.display = 'block'
        btn.disabled = false
        btn.textContent = 'Entrar'
      }
    })
  }

  function addRefreshButton() {
    if (document.getElementById('nm-refresh-btn')) return
    const btn = document.createElement('button')
    btn.id = 'nm-refresh-btn'
    btn.innerHTML = '<i class="fas fa-sync-alt me-1"></i> NexusMail'
    btn.style.cssText = 'position:fixed;bottom:1rem;right:1rem;z-index:9998;background:#111;color:#a78bfa;border:1px solid #4c1d95;padding:0.35rem 0.75rem;border-radius:6px;font-size:0.75rem;cursor:pointer'
    btn.addEventListener('click', init)
    document.body.appendChild(btn)
  }

  function wireLogout() {
    const logoutEl = document.getElementById('nm-logout-btn')
    if (!logoutEl) return
    logoutEl.addEventListener('click', (e) => {
      e.preventDefault()
      clearTokens()
      document.querySelectorAll('.balance-card h3.fw-bold').forEach((el) => (el.textContent = '—'))
      const list = document.querySelector('.transaction-list')
      if (list) list.innerHTML = ''
      const upcoming = document.getElementById('nm-upcoming-list')
      if (upcoming) upcoming.innerHTML = '<p class="text-muted text-center small">Desconectado</p>'
      document.getElementById('nm-accounts-badge')?.remove()
      renderLoginOverlay()
    })
  }

  function addLoadingSpinner() {
    if (document.getElementById('nm-spinner')) return
    const spinner = document.createElement('div')
    spinner.id = 'nm-spinner'
    spinner.style.cssText = 'position:fixed;inset:0;z-index:9990;background:rgba(255,255,255,0.6);display:none;align-items:center;justify-content:center'
    spinner.innerHTML = '<div style="width:40px;height:40px;border:4px solid #ff8c00;border-top-color:transparent;border-radius:50%;animation:nm-spin 0.8s linear infinite"></div>'
    document.head.insertAdjacentHTML('beforeend', '<style>@keyframes nm-spin{to{transform:rotate(360deg)}}</style>')
    document.body.appendChild(spinner)
  }

  async function init() {
    if (!getToken()) { renderLoginOverlay(); return }
    setLoading(true)
    try {
      const summary = await apiFetch('/api/finances/summary')
      renderSummary(summary)
    } catch { }
    finally { setLoading(false) }
  }

  function boot() {
    addLoadingSpinner()
    addRefreshButton()
    wireLogout()
    init()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot)
  } else {
    boot()
  }
})()
