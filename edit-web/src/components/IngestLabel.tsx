import { useState } from 'react'
import { useIngestBrand } from '../api/hooks'
import { AxiosError } from 'axios'

export default function IngestLabel() {
  const [url, setUrl] = useState('')
  const ingest = useIngestBrand()

  const submit = () => {
    const v = url.trim()
    if (!v) return
    ingest.mutate(v, { onSuccess: () => setUrl('') })
  }

  const errorDetail =
    ingest.isError && ingest.error instanceof AxiosError
      ? (ingest.error.response?.data as { detail?: string })?.detail ?? 'Could not read that label.'
      : null

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
      <h2
        style={{
          fontFamily: 'var(--serif)',
          fontWeight: 400,
          fontSize: 'clamp(28px,4vw,48px)',
          lineHeight: 1,
          letterSpacing: '-.02em',
          margin: 0,
        }}
      >
        Follow a label.
      </h2>
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--ink)', width: 'min(560px,100%)' }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="paste a brand url"
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            background: 'none',
            font: 'inherit',
            fontSize: 17,
            padding: '12px 0',
            color: 'var(--ink)',
          }}
        />
        <button
          onClick={submit}
          disabled={ingest.isPending}
          style={{
            border: 'none',
            background: 'none',
            font: 'inherit',
            fontSize: 12.5,
            color: 'var(--accent)',
            cursor: 'pointer',
            padding: '12px 4px',
          }}
        >
          {ingest.isPending ? 'Reading…' : 'Add ↗'}
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--muted)', maxWidth: '44ch' }}>
        We read the label's catalogue and file its pieces into your tiers.
      </p>
      {ingest.isSuccess && (
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--accent)' }}>
          Added {ingest.data.name} — {ingest.data.product_count} pieces filed.
        </p>
      )}
      {errorDetail && <p style={{ margin: 0, fontSize: 13.5, color: 'var(--accent)' }}>{errorDetail}</p>}
    </section>
  )
}
