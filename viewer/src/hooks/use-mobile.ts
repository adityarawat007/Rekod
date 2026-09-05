import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

// Edited from shadcn's generated version, which set state inside an effect and
// so rendered twice on mount — once as `false`, once with the real value. Same
// subscription, read through useSyncExternalStore instead. Re-run `shadcn add
// sidebar` and this comes back; reapply.
const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false, // no viewport on the server; the desktop sidebar is the safe default
  )
}
