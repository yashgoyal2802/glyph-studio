export type Route = { name: 'library' } | { name: 'editor'; id: string }

/**
 * Screens live in the URL hash (#/design/<id>) so the browser's and Android's Back button return to the library
 * without any extra code, and a reload reopens the same design.
 */
export function parseRoute(hash: string): Route {
  const m = /^#\/design\/([A-Za-z0-9_-]{1,64})$/.exec(hash)
  return m ? { name: 'editor', id: m[1] } : { name: 'library' }
}

export function hashFor(route: Route): string {
  return route.name === 'editor' ? `#/design/${route.id}` : '#/'
}
