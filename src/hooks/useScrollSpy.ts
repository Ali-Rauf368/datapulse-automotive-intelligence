import { useEffect, useState } from 'react'

// Tracks which of the given sections (by "#id") is currently in view.
export function useScrollSpy(hrefs: string[], enabled: boolean) {
  const [active, setActive] = useState(hrefs[0])

  useEffect(() => {
    if (!enabled) return

    const sections = hrefs
      .map((href) => document.querySelector(href))
      .filter((section): section is Element => section !== null)

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]

        if (visible) setActive(`#${visible.target.id}`)
      },
      { rootMargin: '-15% 0px -70% 0px' },
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [hrefs, enabled])

  return [active, setActive] as const
}
