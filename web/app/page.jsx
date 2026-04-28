import { getStats, getFeaturedCards, RARITY_BG, RARITY_COLOR, RARITY_LABEL } from '../lib/api'

export const revalidate = 300

export default async function Home() {
  const [stats, featured] = await Promise.all([
    getStats(),
    getFeaturedCards(4),
  ])

  return (
    <div style={{ position: 'relative', overflow: 'hidden' }}>

      {/* ── Hero ── */}
      <section style={{
        minHeight: '86vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '80px 24px 60px', textAlign: 'center',
        position: 'relative', zIndex: 1,
        background: 'radial-gradient(ellipse 100% 60% at 20% 10%,rgba(88,28,135,.2) 0%,transparent 55%),radial-gradient(ellipse 80% 50% at 80% 80%,rgba(124,58,237,.1) 0%,transparent 50%)',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.2em', textTransform: 'uppercase', color: '#8b5cf6', marginBottom: 16 }}>
          WELCOME TO THE WORLD OF
        </div>
        <h1 style={{
          fontFamily: 'Cinzel,serif', fontSize: 'clamp(48px,8vw,88px)', fontWeight: 900, lineHeight: 1.05,
          background: 'linear-gradient(135deg,#f0f0ff 0%,#c4b5fd 40%,#ec4899 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: 20,
        }}>SeorinTCG</h1>
        <p style={{ maxWidth: 520, fontSize: 16, lineHeight: 1.7, color: 'rgba(240,240,255,.65)', marginBottom: 40 }}>
          A Discord bot where you roll for anime cards, capture them with talismans,
          build your collection, and compete in faction wars every season.
        </p>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="https://discord.com/oauth2/authorize" style={{
            padding: '14px 32px', background: 'linear-gradient(135deg,#7c3aed,#ec4899)',
            borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#fff',
            boxShadow: '0 0 30px rgba(124,58,237,.5)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <svg width="18" height="14" viewBox="0 0 71 55" fill="white">
              <path d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a40 40 0 0 0-1.8 3.6 54.2 54.2 0 0 0-16.2 0A40 40 0 0 0 25.8.4 58.5 58.5 0 0 0 11.2 4.9C1.6 19.2-.9 33.1.3 46.8a59 59 0 0 0 17.9 9 42 42 0 0 0 3.7-6 38.3 38.3 0 0 1-5.8-2.8l1.4-1.1a42 42 0 0 0 36.2 0l1.4 1.1a38.3 38.3 0 0 1-5.8 2.8 42 42 0 0 0 3.6 6 58.7 58.7 0 0 0 17.9-9C72.3 30.8 68.4 17 60.1 4.9z"/>
            </svg>
            Add to Discord — It's free
          </a>
          <a href="/events" style={{
            padding: '14px 28px', background: 'rgba(139,92,246,.1)',
            border: '1px solid rgba(139,92,246,.3)', borderRadius: 10,
            fontSize: 14, fontWeight: 600, color: '#c4b5fd',
          }}>View Events</a>
        </div>
      </section>

      {/* ── Stats ── */}
      <section style={{ maxWidth: 700, margin: '0 auto 80px', padding: '0 24px', position: 'relative', zIndex: 1 }}>
        <div style={{
          background: 'rgba(14,14,26,.7)', border: '1px solid rgba(139,92,246,.2)',
          borderRadius: 16, padding: '28px 40px',
          display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
          backdropFilter: 'blur(10px)',
        }}>
          {[
            { icon: '👥', value: stats.players?.toLocaleString?.() ?? stats.players ?? '—', label: 'Players' },
            { icon: '🃏', value: stats.cards?.toLocaleString?.() ?? stats.cards ?? '—', label: 'Unique Cards' },
            { icon: '⚔️', value: '2', label: 'Factions' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center', borderRight: i < 2 ? '1px solid rgba(139,92,246,.15)' : 'none', padding: '4px 20px' }}>
              <div style={{ fontSize: 22, marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontFamily: 'Cinzel,serif', fontSize: 28, fontWeight: 700, color: '#f0f0ff', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#6060a0', marginTop: 4, textTransform: 'uppercase', letterSpacing: '.1em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Featured Cards ── */}
      <section style={{ maxWidth: 1000, margin: '0 auto 100px', padding: '0 24px', position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cinzel,serif', fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 8 }}>
          Featured <span style={{ color: '#8b5cf6' }}>Cards</span>
        </h2>
        <p style={{ fontSize: 13, color: '#6060a0', marginBottom: 32 }}>A selection from the SeorinTCG collection</p>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
          {(featured.length > 0 ? featured : [
            { cardId: '1', name: 'Killua Zoldyck',  anime: 'Hunter × Hunter',   rarity: 'exceptional', imageUrl: '' },
            { cardId: '2', name: 'Alya',             anime: 'My Dear Alya',      rarity: 'special',     imageUrl: '' },
            { cardId: '3', name: 'Marin Kitagawa',   anime: 'My Dress-Up Darling', rarity: 'exceptional', imageUrl: '' },
            { cardId: '4', name: 'Ichigo Kurosaki',  anime: 'Bleach',            rarity: 'rare',        imageUrl: '' },
          ]).map((card) => (
            <CardPreview key={card.cardId ?? card.name} card={card} />
          ))}
        </div>
      </section>

      {/* ── How to Play ── */}
      <section style={{ maxWidth: 900, margin: '0 auto 100px', padding: '0 24px', position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cinzel,serif', fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 8 }}>
          How to <span style={{ color: '#ec4899' }}>Play</span>
        </h2>
        <p style={{ fontSize: 13, color: '#6060a0', marginBottom: 40 }}>Get started in three simple steps</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
          {[
            { num: '01', title: 'Register', color: '#8b5cf6', desc: 'Use /register in Discord. Complete the tutorial, choose your faction, and claim your starter pack of 200,000 Nyang + talismans.' },
            { num: '02', title: 'Roll & Capture', color: '#ec4899', desc: 'Spend Qi to reveal an anime card. Select a talisman to attempt capture — each rarity has different odds. Chain rolls to keep going!' },
            { num: '03', title: 'Compete', color: '#f59e0b', desc: 'Every capture earns faction points. Climb the leaderboard of your faction and claim exclusive seasonal rewards.' },
          ].map((s) => (
            <div key={s.num} style={{
              background: 'rgba(14,14,26,.6)', border: '1px solid rgba(139,92,246,.15)',
              borderRadius: 14, padding: '32px 24px', textAlign: 'left',
              backdropFilter: 'blur(10px)',
            }}>
              <div style={{ fontFamily: 'Space Mono,monospace', fontSize: 36, fontWeight: 700, color: s.color, marginBottom: 16, lineHeight: 1 }}>{s.num}</div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#f0f0ff', marginBottom: 10 }}>{s.title}</h3>
              <p style={{ fontSize: 13, color: '#8080b0', lineHeight: 1.7 }}>{s.desc}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 48 }}>
          <a href="https://discord.com/oauth2/authorize" style={{
            padding: '14px 36px', background: 'linear-gradient(135deg,#7c3aed,#ec4899)',
            borderRadius: 10, fontSize: 14, fontWeight: 700, color: '#fff',
            boxShadow: '0 0 30px rgba(124,58,237,.4)', display: 'inline-block',
          }}>Add SeorinTCG to your server</a>
        </div>
      </section>

      {/* ── Factions ── */}
      <section style={{ maxWidth: 900, margin: '0 auto 100px', padding: '0 24px', position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <h2 style={{ fontFamily: 'Cinzel,serif', fontSize: 28, fontWeight: 700, color: '#f0f0ff', marginBottom: 10 }}>
          Choose Your <span style={{ color: '#8b5cf6' }}>Faction</span>
        </h2>
        <p style={{ fontSize: 13, color: '#6060a0', marginBottom: 40 }}>
          Earn points every roll. Top 10 each faction get exclusive rewards every 3 months.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {[
            { name: 'Heavenly Demon Cult', desc: 'Walk the path of demons. Power through destruction.', color: '#ef4444', bg: 'rgba(239,68,68,.06)', border: 'rgba(239,68,68,.2)', emoji: '🔴', count: stats.factions?.heavenly_demon ?? '?' },
            { name: 'Orthodox Sect',       desc: 'Follow the righteous path. Strength through discipline.', color: '#3b82f6', bg: 'rgba(59,130,246,.06)', border: 'rgba(59,130,246,.2)', emoji: '🔵', count: stats.factions?.orthodox ?? '?' },
          ].map((f) => (
            <div key={f.name} style={{
              background: f.bg, border: `1px solid ${f.border}`,
              borderRadius: 14, padding: '32px 28px',
            }}>
              <div style={{ fontSize: 36, marginBottom: 14 }}>{f.emoji}</div>
              <h3 style={{ fontFamily: 'Cinzel,serif', fontSize: 17, fontWeight: 700, color: '#f0f0ff', marginBottom: 10 }}>{f.name}</h3>
              <p style={{ fontSize: 13, color: '#8080b0', lineHeight: 1.6, marginBottom: 12 }}>{f.desc}</p>
              <div style={{ fontSize: 12, color: f.color, fontWeight: 700 }}>{f.count} members</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function CardPreview({ card }) {
  const bg    = RARITY_BG[card.rarity]    ?? RARITY_BG.common
  const color = RARITY_COLOR[card.rarity] ?? RARITY_COLOR.common
  const label = RARITY_LABEL[card.rarity] ?? 'COMMON'

  return (
    <div style={{ width: 155, flexShrink: 0 }}>
      <div style={{
        borderRadius: 12, overflow: 'hidden',
        border: `2px solid ${color}44`,
        boxShadow: `0 0 24px ${color}33, 0 8px 32px rgba(0,0,0,.6)`,
        background: '#0e0e1a',
      }}>
        <div style={{ height: 3, background: bg }} />
        <div style={{
          height: 200,
          background: card.imageUrl ? `#0a0a16 url(${card.imageUrl}) center/cover` : '#0a0a16',
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {!card.imageUrl && <span style={{ fontSize: 40, opacity: 0.2 }}>🌸</span>}
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            background: bg, borderRadius: 5, padding: '2px 7px',
            fontSize: 9, fontWeight: 800, letterSpacing: '.1em', color: '#fff',
          }}>{label}</div>
        </div>
        <div style={{ padding: '10px 12px 12px' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f0f0ff', marginBottom: 3 }}>{card.name}</div>
          <div style={{ fontSize: 11, color: '#8080b0' }}>{card.anime}</div>
        </div>
      </div>
    </div>
  )
}
