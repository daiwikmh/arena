import { useEffect, useRef, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import gsap from 'gsap'
import { getProject } from '../lib/shotsApi'

const VIDEO_SRC =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260510_060007_60275ce7-030c-4668-a160-8f364ec537d3.mp4'

const NAV_LINKS = ['DIRECT', 'SHOTS', 'GALLERY', 'DOCS']

function newProjectId(): string {
  if ('randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function Hero() {
  const videoBgRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [mounted, setMounted] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)

    const videoBg = videoBgRef.current
    if (!videoBg) return

    let currentX = 0
    let currentY = 0
    let targetX = 0
    let targetY = 0

    const onMouseMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      targetX = ((e.clientX - cx) / cx) * 20
      targetY = ((e.clientY - cy) / cy) * 20
    }

    let frame = 0
    const tick = () => {
      currentX += (targetX - currentX) * 0.06
      currentY += (targetY - currentY) * 0.06
      gsap.set(videoBg, { x: currentX, y: currentY })
      frame = requestAnimationFrame(tick)
    }

    window.addEventListener('mousemove', onMouseMove)
    frame = requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      cancelAnimationFrame(frame)
    }
  }, [])

  const onLoadedMetadata = () => {
    if (videoRef.current) videoRef.current.playbackRate = 1.25
  }

  const onDirect = async () => {
    if (creating) return
    setCreating(true)
    setCreateError(null)
    try {
      const id = newProjectId()
      await getProject(id)
      window.location.href = `/studio/${id}`
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not reach the engine.')
      setCreating(false)
    }
  }

  return (
    <div
      className="min-h-screen bg-black text-white overflow-x-hidden"
      style={{ fontFamily: "'Roboto', sans-serif" }}
    >
      <div ref={videoBgRef} className="fixed inset-0 z-0 scale-[1.08] origin-center">
        <video
          ref={videoRef}
          src={VIDEO_SRC}
          autoPlay
          muted
          loop
          playsInline
          onLoadedMetadata={onLoadedMetadata}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/25" />
      </div>

      <header className="fixed top-0 inset-x-0 z-50 px-10 py-8 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="" className="h-6 w-6" />
          <span className="text-[17px] font-semibold tracking-tight" style={{ fontFamily: "'Dirtyline', sans-serif" }}>
            Arena<sup>TM</sup>
          </span>
        </div>

        <nav className="liquid-glass rounded-full px-2 py-2 flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <a
              key={link}
              href="#"
              className="text-[11px] font-medium tracking-[0.12em] text-white/90 hover:text-white px-4 py-1.5 rounded-full transition-colors duration-200"
            >
              {link}
            </a>
          ))}
        </nav>

        <a
          href="#"
          className="liquid-glass rounded-full px-5 py-2.5 text-[11px] font-medium tracking-[0.12em] text-white/90 hover:text-white"
        >
          GET STARTED
        </a>
      </header>

      <div
        className={`fixed left-1/2 -translate-x-1/2 z-20 text-center transition-all duration-1000 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
        style={{ top: '120px' }}
      >
        <h1
          style={{
            fontFamily: "'Roboto', sans-serif",
            fontWeight: 400,
            fontSize: 'clamp(40px, 5.4vw, 72px)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}
        >
          <span className="block text-white">Direct the shot.</span>
          <span className="block" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Skip the timeline.
          </span>
        </h1>
      </div>

      <div
        className={`fixed bottom-14 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-6 transition-all duration-1000 delay-300 ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}
      >
        <p className="max-w-[620px] text-[15px] leading-relaxed text-center">
          <span className="text-white">
            Describe a shot and approve its frame for pennies before anything gets animated —
            swap elements, shift the light, extend the story, all by saying so.
          </span>
          <span className="text-white/55"> One conversation, a finished multi-shot scene.</span>
        </p>

        <button
          onClick={onDirect}
          disabled={creating}
          className="bg-white text-black text-[15px] font-medium rounded-full px-8 py-3.5 transition-all duration-200 hover:scale-[1.03] hover:shadow-[0_0_32px_4px_rgba(255,255,255,0.2)] active:scale-[0.97] disabled:opacity-60 disabled:hover:scale-100 disabled:hover:shadow-none"
        >
          {creating ? 'Opening the studio…' : 'Direct a scene'}
        </button>

        {createError && (
          <p className="text-[12px] text-red-400/90 max-w-[420px] text-center">{createError}</p>
        )}

        <div className="flex items-center gap-2">
          <Clapperboard size={13} strokeWidth={1.5} className="text-white/70" />
          <span className="text-[11px] font-medium tracking-[0.14em] text-white/70">
            PHYSICS-CHECKED. EVERY SWAP VERIFIED.
          </span>
        </div>
      </div>
    </div>
  )
}
