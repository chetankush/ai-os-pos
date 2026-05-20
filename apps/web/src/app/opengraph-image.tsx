import { ImageResponse } from 'next/og';

export const alt = 'Sangam — the AI-native POS for Indian restaurants & cafes';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const TRIQUETRA = 'M24 6 C11 11 11 25 24 30 C37 25 37 11 24 6 Z';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: '#ffffff',
        padding: '80px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
        <svg width="80" height="80" viewBox="0 0 48 48" fill="none">
          <g
            stroke="#db5437"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          >
            <path d={TRIQUETRA} />
            <path d={TRIQUETRA} transform="rotate(120 24 24)" />
            <path d={TRIQUETRA} transform="rotate(240 24 24)" />
          </g>
        </svg>
        <div style={{ fontSize: '48px', fontWeight: 700, color: '#1c1917' }}>
          Sangam
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div
          style={{
            fontSize: '74px',
            fontWeight: 800,
            color: '#1c1917',
            lineHeight: 1.05,
            letterSpacing: '-2px',
            maxWidth: '940px',
          }}
        >
          The AI-native POS for Indian restaurants & cafes.
        </div>
        <div style={{ fontSize: '32px', color: '#78716c', maxWidth: '840px' }}>
          QR ordering, an AI waiter, UPI payments & GST billing — 0% commission,
          and your data stays yours.
        </div>
      </div>

      <div style={{ display: 'flex', gap: '16px' }}>
        {['0% commission', 'UPI-native', 'GST-ready', 'AI waiter'].map((t) => (
          <div
            key={t}
            style={{
              display: 'flex',
              fontSize: '24px',
              color: '#db5437',
              border: '2px solid #f1ddd6',
              borderRadius: '999px',
              padding: '8px 22px',
            }}
          >
            {t}
          </div>
        ))}
      </div>
    </div>,
    { ...size },
  );
}
