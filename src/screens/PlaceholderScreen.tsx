// src/screens/PlaceholderScreen.tsx
//
// The honest placeholder each T7 screen route renders until its port lands.
// It says exactly what it is — no seed data, no mocked-up UI that could be
// mistaken for live state. Each screen replaces its placeholder in a
// follow-up commit of the T7 series.

import type React from 'react'

interface PlaceholderScreenProps {
  /** Display name, e.g. 'Records'. */
  name: string
  /** Route slug, e.g. 'records' (drives the data-testid). */
  slug: string
  /** One sentence on what the ported screen will do. */
  description: string
}

export function PlaceholderScreen(props: PlaceholderScreenProps): React.JSX.Element {
  const { name, slug, description } = props
  return (
    <section className="screen-placeholder" data-testid={`screen-${slug}`}>
      <h2 className="screen-title">{name}</h2>
      <p className="screen-placeholder-note" data-testid={`screen-${slug}-placeholder`}>
        Not ported yet. This route is a T7 foundation placeholder — it shows no
        data because it has fetched none.
      </p>
      <p className="screen-placeholder-desc">{description}</p>
    </section>
  )
}
