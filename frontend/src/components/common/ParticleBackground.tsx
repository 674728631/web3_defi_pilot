import { useEffect, useRef } from 'react'

class Particle {
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  opacity: number
  hue: number
  w: number
  h: number

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.x = Math.random() * w
    this.y = Math.random() * h
    this.size = Math.random() * 1.5 + 0.5
    this.speedX = (Math.random() - 0.5) * 0.3
    this.speedY = (Math.random() - 0.5) * 0.3
    this.opacity = Math.random() * 0.5 + 0.1
    this.hue = Math.random() > 0.5 ? 190 : 270
  }

  update() {
    this.x += this.speedX
    this.y += this.speedY
    if (this.x < 0 || this.x > this.w || this.y < 0 || this.y > this.h) {
      this.x = Math.random() * this.w
      this.y = Math.random() * this.h
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fillStyle = `hsla(${this.hue}, 100%, 70%, ${this.opacity})`
    ctx.fill()
  }
}

export default function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    let particles: Particle[] = []

    function resize() {
      canvas!.width = window.innerWidth
      canvas!.height = window.innerHeight
      particles = Array.from({ length: 80 }, () => new Particle(canvas!.width, canvas!.height))
    }

    function drawConnections() {
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x
          const dy = particles[i].y - particles[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 150) {
            ctx!.beginPath()
            ctx!.moveTo(particles[i].x, particles[i].y)
            ctx!.lineTo(particles[j].x, particles[j].y)
            ctx!.strokeStyle = `rgba(0, 224, 255, ${0.06 * (1 - dist / 150)})`
            ctx!.lineWidth = 0.5
            ctx!.stroke()
          }
        }
      }
    }

    function animate() {
      ctx!.clearRect(0, 0, canvas!.width, canvas!.height)
      particles.forEach((p) => {
        p.update()
        p.draw(ctx!)
      })
      drawConnections()
      animId = requestAnimationFrame(animate)
    }

    resize()
    animate()
    window.addEventListener('resize', resize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <>
      {/* Floating Orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      {/* Particle Canvas */}
      <canvas ref={canvasRef} className="particle-canvas fixed inset-0 z-0 opacity-40" />

      {/* Grid overlay */}
      <div className="particle-grid-bg fixed inset-0 z-[1] pointer-events-none" />

      {/* Radial vignette */}
      <div className="particle-vignette fixed inset-0 z-[1] pointer-events-none" />
    </>
  )
}
