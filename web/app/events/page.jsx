'use client'

const EVENTS = [
  {
    id: 1,
    title: 'Spring Blossom Festival',
    description: 'Hunt for limited Spring 2025 edition cards. Collect Cherry Blossom Petals and exchange them for exclusive Radiant cards.',
    status: 'active',
    icon: '🌸',
    color: '#ec4899',
    startDate: '2025-04-01',
    endDate: '2025-04-30',
  },
  {
    id: 2,
    title: "Valentine's Day 2025",
    description: 'This event has ended. Thank you for participating!',
    status: 'ended',
    icon: '💝',
    color: '#f43f5e',
    startDate: '2025-02-01',
    endDate: '2025-02-28',
  },
  {
    id: 3,
    title: "New Year 2025: Dawn of Battles",
    description: 'This event has ended. Thank you for participating!',
    status: 'ended',
    icon: '🎆',
    color: '#f59e0b',
    startDate: '2025-01-01',
    endDate: '2025-01-15',
  },
  {
    id: 4,
    title: 'Winter Solstice 2024',
    description: 'This event has ended. You can view the gallery but rewards are no longer claimable.',
    status: 'ended',
    icon: '❄️',
    color: '#06b6d4',
    startDate: '2024-12-01',
    endDate: '2024-12-31',
  },
]

export default function EventsPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '48px 24px', position: 'relative', zIndex: 1 }}>
      <div style={{ textAlign: 'center', marginBottom: 48, animation: 'fadeUp 0.6s ease both' }}>
        <h1 style={{
          fontFamily: 'Cinzel, serif', fontSize: 36, fontWeight: 700,
          marginBottom: 10,
        }}>
          <span style={{ color: '#f0f0ff' }}>Active </span>
          <span style={{ color: '#8b5cf6' }}>Events</span>
        </h1>
        <p style={{ fontSize: 14, color: '#6060a0' }}>
          Participate in limited-time events to earn exclusive cards, talismans and badges.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {EVENTS.map((ev, i) => (
          <div key={ev.id} style={{
            background: ev.status === 'active' ? 'rgba(14,14,26,0.8)' : 'rgba(10,10,18,0.5)',
            border: `1px solid ${ev.status === 'active' ? ev.color + '33' : 'rgba(139,92,246,0.08)'}`,
            borderRadius: 14,
            display: 'flex', gap: 0,
            overflow: 'hidden',
            animation: `fadeUp 0.6s ease ${0.05 * i}s both`,
            transition: 'border-color 0.2s',
          }}>
            {/* Icon panel */}
            <div style={{
              width: 120, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: ev.status === 'active' ? `${ev.color}11` : 'rgba(255,255,255,0.02)',
              fontSize: 44,
              borderRight: `1px solid ${ev.status === 'active' ? ev.color + '22' : 'rgba(139,92,246,0.08)'}`,
            }}>{ev.icon}</div>

            {/* Content */}
            <div style={{ flex: 1, padding: '24px 28px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                {ev.status === 'active' ? (
                  <>
                    <span style={{
                      background: 'rgba(16,185,129,0.15)',
                      border: '1px solid rgba(16,185,129,0.3)',
                      color: '#6ee7b7',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                      padding: '2px 8px', borderRadius: 5,
                      textTransform: 'uppercase',
                    }}>ACTIVE EVENT</span>
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 11, color: '#6ee7b7',
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#10b981',
                        boxShadow: '0 0 6px #10b981',
                        animation: 'glow-pulse 2s ease infinite',
                        display: 'inline-block',
                      }}></span>
                      Live Now
                    </span>
                  </>
                ) : (
                  <>
                    <span style={{
                      background: 'rgba(107,114,128,0.15)',
                      border: '1px solid rgba(107,114,128,0.2)',
                      color: '#6b7280',
                      fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                      padding: '2px 8px', borderRadius: 5,
                      textTransform: 'uppercase',
                    }}>PAST EVENT</span>
                    <span style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      fontSize: 11, color: '#6b7280',
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#6b7280',
                        display: 'inline-block',
                      }}></span>
                      Ended
                    </span>
                  </>
                )}
              </div>

              <h3 style={{
                fontFamily: 'Cinzel, serif',
                fontSize: ev.status === 'active' ? 18 : 15,
                fontWeight: 700,
                color: ev.status === 'active' ? '#f0f0ff' : '#6060a0',
                marginBottom: 8,
              }}>{ev.title}</h3>

              <p style={{
                fontSize: 13, color: ev.status === 'active' ? '#a0a0c0' : '#4a4a6a',
                lineHeight: 1.6, maxWidth: 580, marginBottom: ev.status === 'active' ? 18 : 0,
              }}>{ev.description}</p>

              {ev.status === 'active' && (
                <button style={{
                  padding: '9px 20px',
                  background: `linear-gradient(135deg, ${ev.color}, #8b5cf6)`,
                  border: 'none', borderRadius: 7,
                  fontSize: 12, fontWeight: 700, color: '#fff',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'none'}
                >
                  Enter Event
                  <span style={{ fontSize: 10 }}>›</span>
                </button>
              )}
            </div>

            {/* Date */}
            <div style={{
              width: 110, flexShrink: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: '0 16px',
              borderLeft: '1px solid rgba(139,92,246,0.08)',
              fontSize: 11, color: '#4a4a6a', textAlign: 'center', gap: 4,
            }}>
              <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4a4a72' }}>Duration</div>
              <div style={{ color: '#6060a0', lineHeight: 1.5 }}>
                {ev.startDate.slice(5)}<br/>→ {ev.endDate.slice(5)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Coming soon */}
      <div style={{
        marginTop: 48, padding: '32px',
        background: 'rgba(139,92,246,0.05)',
        border: '1px dashed rgba(139,92,246,0.2)',
        borderRadius: 14, textAlign: 'center',
        animation: 'fadeUp 0.6s ease 0.3s both',
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔮</div>
        <h3 style={{ fontFamily: 'Cinzel, serif', fontSize: 16, fontWeight: 700, color: '#8b5cf6', marginBottom: 8 }}>
          Next Event — Coming Soon
        </h3>
        <p style={{ fontSize: 13, color: '#6060a0' }}>
          New events are announced in our Discord server. Join to be the first to know!
        </p>
        <a href="https://discord.com/oauth2/authorize" style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          marginTop: 16, padding: '10px 22px',
          background: 'rgba(139,92,246,0.12)',
          border: '1px solid rgba(139,92,246,0.25)',
          borderRadius: 8, fontSize: 13, fontWeight: 600, color: '#c4b5fd',
          transition: 'all 0.2s',
        }}>Join Discord</a>
      </div>
    </div>
  )
}
