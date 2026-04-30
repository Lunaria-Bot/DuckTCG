'use client'

const SAMPLE_CARDS = [
  { name: 'Killua Zoldyck',  anime: 'Hunter × Hunter', rarity: 'exceptional', owned: true  },
  { name: 'Alya',            anime: 'My Dear Alya',    rarity: 'special',     owned: true  },
  { name: 'Marin Kitagawa',  anime: 'My Dress-Up Darling', rarity: 'exceptional', owned: true },
  { name: 'Ichigo Kurosaki', anime: 'Bleach',          rarity: 'rare',        owned: true  },
  { name: 'Naruto Uzumaki',  anime: 'Naruto',          rarity: 'common',      owned: false },
  { name: 'Gojo Satoru',     anime: 'Jujutsu Kaisen',  rarity: 'special',     owned: false },
]

const RARITY_COLORS = {
  exceptional: '#f59e0b',
  special:     '#8b5cf6',
  rare:        '#3b82f6',
  common:      '#6b7280',
}
const RARITY_BG = {
  exceptional: 'linear-gradient(135deg, #78350f, #f59e0b)',
  special:     'linear-gradient(135deg, #4c1d95, #8b5cf6)',
  rare:        'linear-gradient(135deg, #1e3a5f, #3b82f6)',
  common:      'linear-gradient(135deg, #1f2937, #6b7280)',
}

export default function ProfilePage() {
  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      {/* Banner */}
      <div style={{
        height: 200,
        background: 'linear-gradient(135deg, #1a0533 0%, #0d1b4b 50%, #0a0a1a 100%)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at 30% 50%, rgba(139,92,246,0.2), transparent 60%), radial-gradient(ellipse at 70% 50%, rgba(236,72,153,0.1), transparent 60%)',
        }}/>
        {/* Floating elements */}
        <div style={{ position: 'absolute', top: 20, right: 80, opacity: 0.3, fontSize: 80, animation: 'float 7s ease-in-out infinite' }}>🌸</div>
        <div style={{ position: 'absolute', top: 40, right: 200, opacity: 0.2, fontSize: 50, animation: 'float 5s ease-in-out infinite 1s' }}>✨</div>
      </div>

      {/* Profile info */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ position: 'relative', marginTop: -50, marginBottom: 32 }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 18,
          }}>
            {/* Avatar */}
            <div style={{
              width: 90, height: 90, borderRadius: '50%',
              border: '3px solid #8b5cf6',
              background: 'linear-gradient(135deg, #7c3aed, #ec4899)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 36, flexShrink: 0,
              boxShadow: '0 0 20px rgba(139,92,246,0.4)',
            }}>🌸</div>
            <div style={{ paddingBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <h1 style={{ fontFamily: 'Cinzel, serif', fontSize: 22, fontWeight: 700, color: '#f0f0ff' }}>Anonymous</h1>
                <span style={{
                  background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.3)',
                  color: '#c4b5fd', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  padding: '2px 8px', borderRadius: 5,
                }}>CARD APPRENTICE</span>
              </div>
              <div style={{ fontSize: 12, color: '#6060a0' }}>SeorinTCG · Member</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button style={{
                  padding: '6px 14px',
                  background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#c4b5fd', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>🔗 Copy Link</button>
                <a href="https://discord.com/oauth2/authorize" style={{
                  padding: '6px 14px',
                  background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#c4b5fd',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>Login to view your profile</a>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 36,
          animation: 'fadeUp 0.6s ease 0.1s both',
        }}>
          {[
            { icon: '🃏', value: '—', label: 'Cards Owned' },
            { icon: '⚔️', value: '—', label: 'Faction Points' },
            { icon: '🔥', value: '—', label: 'Login Streak' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'rgba(14,14,26,0.7)',
              border: '1px solid rgba(139,92,246,0.15)',
              borderRadius: 12, padding: '18px 20px',
              backdropFilter: 'blur(10px)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 18 }}>{s.icon}</span>
                <span style={{ fontSize: 26, fontFamily: 'Cinzel, serif', fontWeight: 700, color: '#f0f0ff' }}>{s.value}</span>
              </div>
              <div style={{ fontSize: 11, color: '#5a5a8a', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Login CTA */}
        <div style={{
          background: 'rgba(139,92,246,0.06)',
          border: '1px solid rgba(139,92,246,0.2)',
          borderRadius: 14, padding: '36px',
          textAlign: 'center',
          animation: 'fadeUp 0.6s ease 0.2s both',
          marginBottom: 40,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔐</div>
          <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 18, fontWeight: 700, color: '#f0f0ff', marginBottom: 10 }}>
            Login to view your profile
          </h2>
          <p style={{ fontSize: 13, color: '#6060a0', marginBottom: 20, maxWidth: 400, margin: '0 auto 20px' }}>
            Connect with Discord to see your cards, faction progress, and customize your profile page.
          </p>
          <a href="https://discord.com/oauth2/authorize" style={{
            padding: '12px 28px',
            background: '#5865F2', borderRadius: 8,
            fontSize: 13, fontWeight: 700, color: '#fff',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            boxShadow: '0 4px 20px rgba(88,101,242,0.4)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 28px rgba(88,101,242,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(88,101,242,0.4)'; }}
          >
            <svg width="18" height="14" viewBox="0 0 71 55" fill="white">
              <path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a40 40 0 0 0-1.8 3.6 54.2 54.2 0 0 0-16.2 0A40 40 0 0 0 25.8.4 58.5 58.5 0 0 0 11.2 4.9C1.6 19.2-.9 33.1.3 46.8a59 59 0 0 0 17.9 9 42 42 0 0 0 3.7-6 38.3 38.3 0 0 1-5.8-2.8l1.4-1.1a42 42 0 0 0 36.2 0l1.4 1.1a38.3 38.3 0 0 1-5.8 2.8 42 42 0 0 0 3.6 6 58.7 58.7 0 0 0 17.9-9C72.3 30.8 68.4 17 60.1 4.9z"/>
            </svg>
            Login with Discord
          </a>
        </div>

        {/* Card Gallery preview */}
        <div style={{ marginBottom: 60 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
            animation: 'fadeUp 0.6s ease 0.3s both',
          }}>
            <span style={{ color: '#8b5cf6', fontSize: 14 }}>✦</span>
            <h2 style={{ fontFamily: 'Cinzel, serif', fontSize: 16, fontWeight: 700, color: '#f0f0ff' }}>SAMPLE CARDS</h2>
          </div>
          <div style={{
            display: 'flex', gap: 14, flexWrap: 'wrap',
            animation: 'fadeUp 0.6s ease 0.35s both',
          }}>
            {SAMPLE_CARDS.map((card, i) => (
              <div key={i} style={{
                width: 100,
                opacity: card.owned ? 1 : 0.35,
                filter: card.owned ? 'none' : 'grayscale(1)',
              }}>
                <div style={{
                  borderRadius: 8, overflow: 'hidden',
                  border: `1px solid ${card.owned ? RARITY_COLORS[card.rarity] + '44' : '#ffffff11'}`,
                  boxShadow: card.owned ? `0 0 14px ${RARITY_COLORS[card.rarity]}22` : 'none',
                  background: '#0e0e1a',
                }}>
                  <div style={{ height: 3, background: card.owned ? RARITY_BG[card.rarity] : '#333' }} />
                  <div style={{
                    height: 120, background: '#0a0a16',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 28, color: 'rgba(139,92,246,0.2)',
                  }}>🌸</div>
                  <div style={{ padding: '7px 9px 9px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: card.owned ? '#f0f0ff' : '#4a4a6a', marginBottom: 2 }}>{card.name}</div>
                    <div style={{ fontSize: 9, color: '#5a5a8a' }}>{card.anime}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
