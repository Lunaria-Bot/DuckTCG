'use client'

export default function ShopPage() {
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px', position: 'relative', zIndex: 1 }}>
      <div style={{ display: 'flex', gap: 32 }}>
        {/* Sidebar */}
        <aside style={{ width: 220, flexShrink: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: '#8b5cf6',
            marginBottom: 16,
          }}>SHOP</div>
          {[
            { icon: '💎', label: 'Premium', active: true },
            { icon: '🎁', label: 'Bundles', active: false },
          ].map((item, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              borderRadius: 8,
              background: item.active ? 'rgba(139,92,246,0.12)' : 'transparent',
              border: item.active ? '1px solid rgba(139,92,246,0.25)' : '1px solid transparent',
              color: item.active ? '#c4b5fd' : '#6060a0',
              fontSize: 13, fontWeight: item.active ? 600 : 400,
              cursor: 'pointer',
              marginBottom: 4,
              transition: 'all 0.2s',
            }}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </aside>

        {/* Main */}
        <div style={{ flex: 1 }}>
          <div style={{ marginBottom: 32, animation: 'fadeUp 0.6s ease both' }}>
            <h1 style={{
              fontFamily: 'Cinzel, serif', fontSize: 28, fontWeight: 700,
              color: '#f0f0ff', marginBottom: 6,
            }}>Premium Membership</h1>
            <p style={{ fontSize: 14, color: '#6060a0' }}>
              Unlock exclusive perks, discounts, and support SeorinTCG.
            </p>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20,
            animation: 'fadeUp 0.6s ease 0.1s both',
          }}>
            {[
              {
                name: 'Card Apprentice', price: '4.99', color: '#10b981',
                features: ['💎 Premium status in-game', '7.5% shop discount', '📜 50× Common Talismans/month', '📋 10× Uncommon Talismans/month', '🎫 1× Faction Pass/month'],
                popular: false,
              },
              {
                name: 'Elite Collector', price: '9.99', color: '#8b5cf6',
                features: ['💎 Premium status in-game', '7.5% shop discount', '📜 100× Common Talismans/month', '📋 25× Uncommon Talismans/month', '✴️ 3× Divine Talismans/month', '🎫 1× Faction Pass/month'],
                popular: true,
              },
              {
                name: 'Legendary Master', price: '19.99', color: '#f59e0b',
                features: ['💎 Premium status in-game', '7.5% shop discount', '📜 200× Common Talismans/month', '📋 50× Uncommon Talismans/month', '✴️ 10× Divine Talismans/month', '🌟 1× Exceptional Talisman/month', '🎫 2× Faction Passes/month'],
                popular: false,
              },
            ].map((tier, i) => (
              <div key={i} style={{
                background: tier.popular ? 'rgba(139,92,246,0.08)' : 'rgba(14,14,26,0.7)',
                border: `1px solid ${tier.popular ? tier.color + '44' : 'rgba(139,92,246,0.15)'}`,
                borderRadius: 14,
                padding: '28px 22px',
                position: 'relative',
                backdropFilter: 'blur(10px)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 0 30px ${tier.color}22`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                {tier.popular && (
                  <div style={{
                    position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)',
                    background: '#8b5cf6', color: '#fff',
                    fontSize: 9, fontWeight: 800, letterSpacing: '0.12em',
                    padding: '3px 12px', borderRadius: 20,
                    textTransform: 'uppercase',
                  }}>POPULAR</div>
                )}

                {/* Icon */}
                <div style={{
                  width: 44, height: 44,
                  background: `${tier.color}22`,
                  border: `1px solid ${tier.color}44`,
                  borderRadius: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, marginBottom: 14,
                }}>{i === 0 ? '🌱' : i === 1 ? '👑' : '⭐'}</div>

                <div style={{ fontSize: 15, fontWeight: 700, color: '#f0f0ff', marginBottom: 4 }}>{tier.name}</div>
                <div style={{ marginBottom: 20 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, color: tier.color }}>${tier.price}</span>
                  <span style={{ fontSize: 12, color: '#6060a0' }}> / month</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 24 }}>
                  {tier.features.map((f, j) => (
                    <div key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: '#a0a0c0', lineHeight: 1.4 }}>
                      <span style={{ color: tier.color, marginTop: 1 }}>✓</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>

                <button style={{
                  width: '100%', padding: '11px',
                  background: tier.popular ? `linear-gradient(135deg, ${tier.color}, #7c3aed)` : 'rgba(139,92,246,0.12)',
                  border: tier.popular ? 'none' : '1px solid rgba(139,92,246,0.25)',
                  borderRadius: 8, fontSize: 13, fontWeight: 700,
                  color: tier.popular ? '#fff' : '#c4b5fd',
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
                >Subscribe</button>
              </div>
            ))}
          </div>

          <p style={{ marginTop: 24, fontSize: 12, color: '#4a4a6a', textAlign: 'center' }}>
            Subscriptions managed through Discord. Contact an admin to activate your perks in-game.
          </p>
        </div>
      </div>
    </div>
  )
}
