// dsh-thoughtdag client half — the lightest possible browser shim.
// It renders a floating "对话 | 思维图" switch over the harness UI and, on
// "思维图", shows a full-screen SAME-ORIGIN iframe at /thoughtdag/ (the SPA
// is served by the host half on the same web server — no CORS, no second
// origin). All conversation smarts live inside the ThoughtDAG app; this file
// only opens the door and forwards the current session id so the canvas can
// offer to mirror it.
//
// Same pattern as dsh-synapse: window.__ModuleLoader__.load with a module
// whose inject lists the client services it reads (sessions) and whose apply
// touches the DOM.

window.__ModuleLoader__.load({
  id: 'dsh-thoughtdag',
  factory: () => {
    const module = { exports: {} }

    module.exports.inject = ['sessions']
    module.exports.apply = ctx => {
      const currentSession = () => {
        const snapshot = ctx.sessions.list.getSnapshot()
        const id = snapshot.current
        if (id === undefined) return null
        const session = snapshot.byId[id]
        return session === undefined ? null : { id, title: session.displayTitle ?? null, cwd: session.cwd ?? null }
      }

      const style = document.createElement('style')
      style.textContent = '.dsh-td-switch{position:fixed;z-index:120;top:12px;left:50%;display:flex;gap:2px;transform:translateX(-50%);border:1px solid #d1d5db;border-radius:999px;background:rgba(255,255,255,.96);padding:3px;backdrop-filter:blur(10px)}.dsh-td-switch button{height:28px;border:0;border-radius:999px;background:transparent;padding:0 11px;color:#6b7280;font:600 12px Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}.dsh-td-switch button:hover{background:#f3f4f6;color:#111827}.dsh-td-switch button.active{background:#111827;color:#fff}.dsh-td-overlay{position:fixed;z-index:100;inset:0;background:#faf9f7}.dsh-td-overlay[hidden]{display:none}.dsh-td-overlay iframe{display:block;width:100%;height:100%;border:0}'
      document.head.append(style)

      const host = document.createElement('div')
      host.innerHTML = '<div class="dsh-td-switch" role="group" aria-label="view switch"><button type="button" data-view="dialog" class="active" aria-pressed="true">对话</button><button type="button" data-view="map" aria-pressed="false">思维图</button></div><section class="dsh-td-overlay" hidden><iframe title="ThoughtDAG" data-src="/thoughtdag/"></iframe></section>'
      document.body.append(host)

      const dialogBtn = host.querySelector('[data-view="dialog"]')
      const mapBtn = host.querySelector('[data-view="map"]')
      const overlay = host.querySelector('.dsh-td-overlay')
      const frame = host.querySelector('iframe')

      const setView = map => {
        dialogBtn.classList.toggle('active', !map)
        dialogBtn.setAttribute('aria-pressed', String(!map))
        mapBtn.classList.toggle('active', map)
        mapBtn.setAttribute('aria-pressed', String(map))
      }
      const close = () => { overlay.hidden = true; setView(false) }
      const send = (type, payload) => frame.contentWindow?.postMessage({ source: 'dsh-thoughtdag', type, ...payload }, location.origin)

      const syncCurrent = () => {
        const session = currentSession()
        send('td:current-session', { session })
      }

      mapBtn.addEventListener('click', () => {
        overlay.hidden = false
        setView(true)
        // the SPA boots on first open, never while hidden: a canvas that
        // measures itself inside a display:none frame fits its view to a 0×0
        // box and shows nothing when revealed
        if (!frame.src) frame.src = frame.dataset.src
        syncCurrent()
        // let the SPA boot, then re-sync so its listener is ready
        window.setTimeout(syncCurrent, 400)
      })
      dialogBtn.addEventListener('click', close)

      window.addEventListener('message', event => {
        if (event.origin !== location.origin || event.data?.source !== 'dsh-thoughtdag') return
        if (event.data.type === 'td:close') return close()
        if (event.data.type === 'td:request-current') return syncCurrent()
        // the canvas forked or continued a session: stage it and go back to the
        // chat, which now shows exactly the context the canvas produced
        if (event.data.type === 'td:select-session' && typeof event.data.session === 'string') {
          ctx.sessions.select(event.data.session)
          if (event.data.close !== false) close()
          syncCurrent()
        }
      })
    }

    return module.exports
  },
})
