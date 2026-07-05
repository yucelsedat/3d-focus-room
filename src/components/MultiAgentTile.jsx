import React, { useState, useEffect, useRef } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

// MultiAgent tile: fikir → mimar (manifest) → orkestratör + worker ekibi → otonom proje.
// 4 durum: draft (fikir gir) → planned (ekip kartları) → running (ilerleme) → done.
// Sunucu tarafı: /api/multiagent/* (server.js MultiAgentRunner). Durum tek çağrıyla
// /loop/status'tan kurulur; loop çalışıyorsa SSE akışına yeniden bağlanır.

const PX_PER_UNIT = 200

// SSE gövdesini satır satır tüket; her data: olayını onEvent'e ver, done'da çık.
async function readSSE(resp, onEvent) {
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (!raw) continue
      let ev
      try { ev = JSON.parse(raw) } catch { continue }
      if (ev.type === 'done') return
      onEvent(ev)
    }
  }
}

export default function MultiAgentTile({ id, width, height }) {
  const w = parseFloat(width)
  const h = parseFloat(height)
  const pxWidth = Math.round(w * PX_PER_UNIT)
  const pxHeight = Math.round(h * PX_PER_UNIT)
  const scaleFactor = w * 40 / pxWidth

  const [idea, setIdea] = useState('')
  const [manifest, setManifest] = useState(null)
  const [missingProfiles, setMissingProfiles] = useState([])
  const [recall, setRecall] = useState(null)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState(null)          // 'architecting'|'orchestrating'|'working'|'verifying'
  const [activeTask, setActiveTask] = useState(null) // { role, task }
  const [liveText, setLiveText] = useState('')       // son assistant metninin kuyruğu
  const [error, setError] = useState(null)
  const [replan, setReplan] = useState(false)        // planned/done'dan draft'a dönüş
  const runningRef = useRef(false)                   // çift startLoop koruması (mount + tık)

  // İnteraktif tool köprüsü otonom modda kullanıcıya ulaşamaz — 5 dk timeout'a
  // takılmasın diye otomatik yanıtla: soru → makul varsayımla devam, plan → onay.
  const autoAnswer = (ev) => {
    if (ev.type === 'ask_question' || ev.type === 'plan_review' || ev.type === 'permission_request') {
      const allow = ev.type === 'plan_review'
      fetch('/api/permission/decision', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toolUseId: ev.toolUseId,
          decision: allow ? 'allow' : 'deny',
          reason: allow ? 'Otonom multiagent modu: plan otomatik onaylandı.' : 'Otonom multiagent modu: en makul varsayımla devam et, soru sorma.',
        }),
      }).catch(() => {})
      return true
    }
    return false
  }

  const grabAssistantText = (ev) => {
    if (ev.type !== 'assistant') return
    const t = (ev.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim()
    if (t) setLiveText(t.length > 220 ? '…' + t.slice(-220) : t)
  }

  const refreshStatus = () => fetch(`/api/multiagent/${id}/loop/status`)
    .then(r => r.json())
    .then(d => {
      if (d.error) return
      if (d.recall) setRecall(d.recall)
      if (d.manifest) setManifest(d.manifest)
      setMissingProfiles(d.missingProfiles || [])
      setRunning(!!d.running)
    })
    .catch(() => {})

  // Mount: durumu yükle; sunucuda loop çalışıyorsa akışa geri bağlan.
  useEffect(() => {
    let cancelled = false
    fetch(`/api/multiagent/${id}/loop/status`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || d.error) return
        setIdea(d.idea || '')
        setManifest(d.manifest || null)
        setMissingProfiles(d.missingProfiles || [])
        setRecall(d.recall || null)
        if (d.running) startLoop()   // reconnect → kaldığı yerden devam
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ── Architect fazı ──────────────────────────────────────────────────────────
  const buildTeam = async () => {
    if (!idea.trim() || phase) return
    setError(null)
    setPhase('architecting')
    setLiveText('')
    try {
      const resp = await fetch(`/api/multiagent/${id}/architect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea: idea.trim() }),
      })
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}))
        throw new Error(e.error || `HTTP ${resp.status}`)
      }
      await readSSE(resp, (ev) => {
        if (autoAnswer(ev)) return
        grabAssistantText(ev)
        if (ev.type === 'architect_done') {
          setManifest(ev.manifest)
          setMissingProfiles(ev.missingProfiles || [])
          setReplan(false)
        } else if (ev.type === 'architect_error' || ev.type === 'error') {
          setError(ev.message)
        }
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setPhase(null)
      setLiveText('')
    }
  }

  // ── Loop (orkestratör + worker'lar) ─────────────────────────────────────────
  const startLoop = async () => {
    if (runningRef.current) return
    runningRef.current = true
    setRunning(true)
    setError(null)
    try {
      const resp = await fetch(`/api/multiagent/${id}/loop/start`, { method: 'POST' })
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}))
        throw new Error(e.error || `HTTP ${resp.status}`)
      }
      await readSSE(resp, (ev) => {
        if (autoAnswer(ev)) return
        grabAssistantText(ev)
        if (ev.recall) setRecall(ev.recall)
        if (ev.type === 'ma_orchestrating') { setPhase('orchestrating'); setActiveTask(null) }
        else if (ev.type === 'ma_task') { setPhase('working'); setActiveTask({ role: ev.role, task: ev.task, taskId: ev.taskId || null }) }
        else if (ev.type === 'ma_task_done') { setActiveTask(null); setLiveText('') }
        else if (ev.type === 'loop_verifying') setPhase('verifying')
        else if (ev.type === 'loop_iteration') { setPhase(null); setActiveTask(null) }
        else if (ev.type === 'error') setError(ev.message)
      })
    } catch (e) {
      setError(e.message)
    } finally {
      runningRef.current = false
      setRunning(false)
      setPhase(null)
      setActiveTask(null)
      setLiveText('')
      refreshStatus()   // nihai recall/running durumunu diskten kur
    }
  }

  const stopLoop = async () => {
    try { await fetch(`/api/multiagent/${id}/loop/stop`, { method: 'POST' }) } catch {}
  }

  // ── Durum türetme ────────────────────────────────────────────────────────────
  const uiState = running ? 'running'
    : (recall?.status === 'met' && !replan) ? 'done'
    : (manifest && !replan) ? 'planned'
    : 'draft'

  const px = { pointerEvents: 'auto' }
  const stopKeys = (e) => e.stopPropagation()

  const btn = (bg, fg, border) => ({
    padding: '10px 14px', borderRadius: '8px', fontSize: '18px', fontWeight: 600,
    cursor: 'pointer', border: `1px solid ${border || bg}`, background: bg, color: fg, ...px,
  })

  const roleColor = (role) => {
    const palette = ['#60a5fa', '#4ade80', '#f59e0b', '#c084fc', '#f87171', '#2dd4bf']
    let n = 0
    for (const c of String(role)) n = (n + c.charCodeAt(0)) % palette.length
    return palette[n]
  }

  const tasks = recall?.tasks || []
  const doneCount = tasks.filter(t => t.status === 'done').length
  const iter = recall?.iteration || 0
  const maxIter = recall?.maxIterations || manifest?.maxIterations || 8
  const phaseLabel = phase === 'architecting' ? 'Mimar ekibi kuruyor…'
    : phase === 'orchestrating' ? 'Orkestratör sıradaki görevi seçiyor…'
    : phase === 'verifying' ? 'Bağımsız doğrulayıcı hedefi denetliyor…'
    : phase === 'working' ? 'Worker çalışıyor…' : null

  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      <Html transform position={[0, 0, 0.01]} scale={scaleFactor} style={{ pointerEvents: 'none' }}>
        <style>{`
          @keyframes maBar{0%{left:-40%}100%{left:110%}}
          @keyframes maPulse{0%,100%{opacity:0.4}50%{opacity:1}}
        `}</style>
        <div
          style={{
            width: `${pxWidth}px`, height: `${pxHeight}px`,
            backgroundColor: '#0d0d12', borderRadius: '8px',
            border: `1px solid ${running ? '#7c3aed' : '#2a2a3e'}`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            fontFamily: 'system-ui, sans-serif', pointerEvents: 'auto',
          }}
          onClick={stopKeys}
          onPointerDown={stopKeys}
        >
          {/* Header */}
          <div style={{ padding: '8px 12px', background: 'linear-gradient(135deg,#241a3a,#141022)', borderBottom: '1px solid #3a2a5e', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, ...px }}>
            <span style={{ fontSize: '26px' }}>🤝</span>
            <span style={{ color: '#c084fc', fontWeight: 600, fontSize: '22px' }}>MultiAgent</span>
            <span style={{ color: '#4a3a6e', fontSize: '20px' }}>#{String(id).slice(-4)}</span>
            <span style={{ flex: 1 }} />
            {uiState === 'running' && (
              <span style={{ color: '#a78bfa', fontSize: '17px', animation: 'maPulse 1.6s infinite' }}>
                iter {iter + 1}/{maxIter}
              </span>
            )}
            {uiState === 'done' && <span style={{ color: '#4ade80', fontSize: '18px' }}>✓ tamamlandı</span>}
          </div>

          {/* Hata bandı */}
          {error && (
            <div style={{ padding: '6px 12px', background: 'rgba(248,113,113,0.12)', borderBottom: '1px solid #7f1d1d', color: '#f87171', fontSize: '16px', flexShrink: 0, ...px }}>
              ⚠ {error}
            </div>
          )}

          {/* Gövde */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px', ...px }}>

            {/* DRAFT — fikir girişi */}
            {uiState === 'draft' && (
              <>
                <p style={{ color: '#8888a8', fontSize: '17px', margin: 0, lineHeight: 1.5 }}>
                  Proje fikrini yaz; <b style={{ color: '#c084fc' }}>mimar</b> stack'i ve ajan ekibini belirlesin.
                  Ekip, hedef doğrulanana kadar projeyi otonom geliştirir.
                </p>
                <textarea
                  value={idea}
                  onChange={e => setIdea(e.target.value)}
                  onKeyDown={stopKeys}
                  placeholder="ör. Kitap okuma alışkanlığımı takip eden basit bir web uygulaması: kitap ekle, günlük sayfa gir, haftalık grafik göster"
                  rows={5}
                  disabled={phase === 'architecting'}
                  style={{
                    width: '100%', boxSizing: 'border-box', background: '#16121f', border: '1px solid #3a2a5e',
                    color: '#e0e0e0', borderRadius: '8px', padding: '10px 12px', fontSize: '17px', resize: 'none', ...px,
                  }}
                />
                {phase === 'architecting' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ position: 'relative', height: '4px', background: '#241a3a', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', top: 0, width: '35%', height: '100%', background: '#a78bfa', borderRadius: '2px', animation: 'maBar 1.4s linear infinite' }} />
                    </div>
                    <p style={{ color: '#a78bfa', fontSize: '16px', margin: 0 }}>🏛 Mimar ekibi kuruyor… (opus, tek sefer)</p>
                    {liveText && <p style={{ color: '#666680', fontSize: '14px', margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{liveText}</p>}
                  </div>
                ) : (
                  <button style={btn('#7c3aed', '#fff')} disabled={!idea.trim()} onClick={buildTeam}>
                    Ekip Kur →
                  </button>
                )}
              </>
            )}

            {/* PLANNED — manifest kartları */}
            {uiState === 'planned' && manifest && (
              <>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {(manifest.stack || []).map((s, i) => (
                    <span key={i} style={{ background: '#241a3a', color: '#c084fc', borderRadius: '999px', padding: '3px 10px', fontSize: '15px' }}>{s}</span>
                  ))}
                </div>
                <div style={{ background: '#16121f', border: '1px solid #2a2a3e', borderRadius: '8px', padding: '8px 12px' }}>
                  <div style={{ color: '#666680', fontSize: '14px', marginBottom: '3px' }}>DOĞRULANABİLİR HEDEF</div>
                  <div style={{ color: '#e0e0e0', fontSize: '16px', lineHeight: 1.45 }}>{manifest.goal}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {manifest.team.map((m, i) => (
                    <div key={i} style={{ background: '#16121f', border: `1px solid ${roleColor(m.role)}33`, borderRadius: '8px', padding: '8px 10px' }}>
                      <div style={{ color: roleColor(m.role), fontWeight: 600, fontSize: '16px' }}>{m.role}</div>
                      <div style={{ color: '#666680', fontSize: '13px', marginBottom: '4px' }}>{m.agentProfile} · {m.model}</div>
                      {m.tasks.map((t, j) => (
                        <div key={j} style={{ color: '#9898b8', fontSize: '14px', lineHeight: 1.4 }}>
                          ○ {typeof t === 'string' ? t : <>{t.id && <span style={{ color: '#666680', fontSize: '12px' }}>{t.id}</span>} {t.text}</>}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
                {missingProfiles.length > 0 && (
                  <div style={{ color: '#f87171', fontSize: '15px' }}>
                    ⚠ Eksik agent profilleri: {missingProfiles.join(', ')} — .claude/agents/ altına ekle.
                  </div>
                )}
                {recall && ['stopped', 'maxed', 'error'].includes(recall.status) && (
                  <div style={{ color: '#f59e0b', fontSize: '15px' }}>
                    ⏸ Önceki çalışma: iter {recall.iteration}/{recall.maxIterations} ({recall.status}
                    {recall.status === 'error' && recall.lastError ? `: ${recall.lastError}` : ''}) — Başlat kaldığı yerden devam eder.
                  </div>
                )}
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
                  <button style={btn('#16121f', '#8888a8', '#2a2a3e')} onClick={() => setReplan(true)}>← Yeniden planla</button>
                  <button
                    style={{ ...btn('#7c3aed', '#fff'), flex: 1, opacity: missingProfiles.length ? 0.5 : 1 }}
                    disabled={missingProfiles.length > 0}
                    onClick={startLoop}
                  >
                    Başlat → ({manifest.maxIterations} iterasyon)
                  </button>
                </div>
              </>
            )}

            {/* RUNNING — ilerleme */}
            {uiState === 'running' && (
              <>
                <div style={{ position: 'relative', height: '6px', background: '#241a3a', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.round(iter / maxIter * 100))}%`, height: '100%', background: 'linear-gradient(90deg,#7c3aed,#c084fc)', borderRadius: '3px', transition: 'width 0.4s' }} />
                </div>
                {phaseLabel && (
                  <div style={{ color: '#a78bfa', fontSize: '16px', animation: 'maPulse 1.6s infinite' }}>
                    {phase === 'working' && activeTask ? `⚡ ${activeTask.role} çalışıyor…` : phaseLabel}
                  </div>
                )}
                {activeTask && (
                  <div style={{ background: '#16121f', border: `1px solid ${roleColor(activeTask.role)}55`, borderRadius: '8px', padding: '8px 12px' }}>
                    <span style={{ color: roleColor(activeTask.role), fontWeight: 600, fontSize: '16px' }}>{activeTask.role}</span>
                    <span style={{ color: '#9898b8', fontSize: '15px' }}> → {activeTask.task}</span>
                  </div>
                )}
                {tasks.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ color: '#666680', fontSize: '14px' }}>GÖREVLER ({doneCount}/{tasks.length})</div>
                    {tasks.map((t, i) => {
                      const isActive = activeTask && t.status === 'pending' && (
                        t.id && activeTask.taskId
                          ? t.id === activeTask.taskId
                          : t.role === activeTask.role && (t.task === activeTask.task || activeTask.task.includes(t.task))
                      )
                      return (
                        <div key={i} style={{ fontSize: '15px', lineHeight: 1.5, color: t.status === 'done' ? '#4ade80' : isActive ? '#f59e0b' : '#666680' }}>
                          {t.status === 'done' ? '✅' : isActive ? '⚡' : '○'}{' '}
                          <span style={{ color: roleColor(t.role) }}>[{t.role}]</span> {t.task}
                        </div>
                      )
                    })}
                  </div>
                )}
                {liveText && (
                  <p style={{ color: '#666680', fontSize: '13px', margin: 0, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{liveText}</p>
                )}
                {recall?.usage && (
                  <div style={{ color: '#666680', fontSize: '13px' }}>
                    tüketim: ~{Math.round((recall.usage.output || 0) / 1000)}k üretim · ~{Math.round(((recall.usage.cacheRead || 0) + (recall.usage.cacheWrite || 0) + (recall.usage.input || 0)) / 1000)}k bağlam · {recall.usage.calls} çağrı
                  </div>
                )}
                <button style={{ ...btn('#2a1a1a', '#f87171', '#7f1d1d'), marginTop: 'auto' }} onClick={stopLoop}>
                  ⏹ Durdur
                </button>
              </>
            )}

            {/* DONE — tamamlandı */}
            {uiState === 'done' && (
              <>
                <div style={{ color: '#4ade80', fontSize: '20px', fontWeight: 600 }}>
                  ✓ Proje tamamlandı (iter {recall.iteration}/{recall.maxIterations})
                </div>
                {recall.lastCheck?.reason && (
                  <div style={{ color: '#9898b8', fontSize: '15px', lineHeight: 1.5 }}>{recall.lastCheck.reason}</div>
                )}
                {recall.review && (
                  <div style={{ background: '#16121f', border: '1px solid #2a2a3e', borderRadius: '8px', padding: '8px 12px' }}>
                    <div style={{ color: '#666680', fontSize: '14px', marginBottom: '4px' }}>CODE REVIEW ÖZETİ</div>
                    <div style={{ color: '#c0c0d8', fontSize: '15px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{recall.review}</div>
                  </div>
                )}
                {tasks.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {tasks.map((t, i) => (
                      <div key={i} style={{ fontSize: '14px', color: '#4ade80' }}>
                        ✅ <span style={{ color: roleColor(t.role) }}>[{t.role}]</span> {t.task}
                      </div>
                    ))}
                  </div>
                )}
                {recall?.usage && (
                  <div style={{ color: '#666680', fontSize: '13px' }}>
                    toplam tüketim: ~{Math.round((recall.usage.output || 0) / 1000)}k üretim · ~{Math.round(((recall.usage.cacheRead || 0) + (recall.usage.cacheWrite || 0) + (recall.usage.input || 0)) / 1000)}k bağlam · {recall.usage.calls} çağrı
                  </div>
                )}
                <button style={{ ...btn('#7c3aed', '#fff'), marginTop: 'auto' }} onClick={() => setReplan(true)}>
                  Yeni Proje
                </button>
              </>
            )}
          </div>
        </div>
      </Html>
    </mesh>
  )
}
