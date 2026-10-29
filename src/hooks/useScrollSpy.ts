import { useEffect, useState } from 'react'

// Tracks which of the given sections (by "#id") is being read: the last one
// whose top has scrolled past a line 30% down the viewport.
export function useScrollSpy(hrefs: string[], enabled: boolean) {
  const [active, setActive] = useState(hrefs[0])

  useEffect(() => {
    if (!enabled) return

    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const line = window.innerHeight * 0.3
        let current = hrefs[0]

        for (const href of hrefs) {
          const section = document.querySelector(href)
          if (section && section.getBoundingClientRect().top <= line) current = href
        }

        // At the very bottom the last section counts as read, even if short.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
          const present = hrefs.filter((href) => document.querySelector(href))
          current = present[present.length - 1] ?? current
        }

        setActive(current)
      })
    }

    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [hrefs, enabled])

  return [active, setActive] as const
}
