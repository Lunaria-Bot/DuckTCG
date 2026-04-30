import './globals.css'

export const metadata = {
  title: 'SeorinTCG — Anime Card Collecting RPG',
  description: 'Collect anime cards, build your collection, and compete in faction wars.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Stars />
        <Navbar />
        <main style={{ position: 'relative', zIndex: 1 }}>
          {children}
        </main>
        <Footer />
      </body>
    </html>
  )
}

function Stars() {
  const stars = Array.from({ length: 80 }, (_, i) => ({
    id: i,
    x: (i * 137.5) % 100,
    y: (i * 97.3) % 100,
    size: (i % 3) + 0.5,
    dur: ((i % 4) + 2).toFixed(1),
    delay: ((i % 5)).toFixed(1),
  }))
  return (
    <div className="stars">
      {stars.map(s => (
        <div key={s.id} className="star" style={{
          left: `${s.x}%`, top: `${s.y}%`,
          width: `${s.size}px`, height: `${s.size}px`,
          '--dur': `${s.dur}s`, '--delay': `${s.delay}s`,
          '--min-op': '0.15', '--max-op': '0.7',
        }} />
      ))}
    </div>
  )
}

function Navbar() {
  const links = [
    { href: '/',       label: 'Home' },
    { href: '/shop',   label: 'Shop' },
    { href: '/events', label: 'Events' },
  ]
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(8,8,16,0.85)',
      backdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(139,92,246,0.15)',
    }}>
      <nav style={{
        maxWidth: 1200, margin: '0 auto', padding: '0 24px',
        height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: 'linear-gradient(135deg,#7c3aed,#ec4899)',
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, boxShadow: '0 0 14px rgba(139,92,246,0.5)',
          }}>🌸</div>
          <span style={{ fontFamily: 'Cinzel,serif', fontWeight: 700, fontSize: 15, letterSpacing: '.05em', color: '#f0f0ff' }}>SEORINTCG</span>
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {links.map(l => (
            <a key={l.href} href={l.href} style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500,
              color: 'rgba(240,240,255,0.7)', transition: 'all .2s',
            }}>{l.label}</a>
          ))}
        </div>
        <a href="https://discord.com/oauth2/authorize" style={{
          padding: '8px 18px', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)',
          borderRadius: 8, fontSize: 13, fontWeight: 700, color: '#fff',
          boxShadow: '0 0 16px rgba(124,58,237,0.4)',
          display: 'flex', alignItems: 'center', gap: 7,
        }}>
          <svg width="16" height="12" viewBox="0 0 71 55" fill="white">
            <path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a40 40 0 0 0-1.8 3.6 54.2 54.2 0 0 0-16.2 0A40 40 0 0 0 25.8.4 58.5 58.5 0 0 0 11.2 4.9C1.6 19.2-.9 33.1.3 46.8a59 59 0 0 0 17.9 9 42 42 0 0 0 3.7-6 38.3 38.3 0 0 1-5.8-2.8l1.4-1.1a42 42 0 0 0 36.2 0l1.4 1.1a38.3 38.3 0 0 1-5.8 2.8 42 42 0 0 0 3.6 6 58.7 58.7 0 0 0 17.9-9C72.3 30.8 68.4 17 60.1 4.9z"/>
          </svg>
          Add to Discord
        </a>
      </nav>
    </header>
  )
}

function Footer() {
  return (
    <footer style={{
      position: 'relative', zIndex: 1,
      borderTop: '1px solid rgba(139,92,246,0.1)',
      background: 'rgba(8,8,16,0.6)',
      padding: '28px 24px', marginTop: 80,
    }}>
      <div style={{
        maxWidth: 1200, margin: '0 auto',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 13, color: 'rgba(240,240,255,0.4)',
        flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>🌸</span>
          <span style={{ fontFamily: 'Cinzel,serif', fontWeight: 600, letterSpacing: '.05em' }}>SeorinTCG</span>
        </div>
        <span>© 2025 SeorinTCG · Not affiliated with any anime studio</span>
        <div style={{ display: 'flex', gap: 20 }}>
          <a href="/privacy" style={{ color: 'rgba(240,240,255,0.4)' }}>Privacy</a>
          <a href="/terms"   style={{ color: 'rgba(240,240,255,0.4)' }}>Terms</a>
        </div>
      </div>
    </footer>
  )
}
