// The app's own path for a link to one of our notes, or nothing for any other link.
// A widget names its note as /?n=<id>, so Chrome hands it to this page instead of loading a new one.
export function notePath(link: string) {
  const url = new URL(link, location.origin)
  const n = url.searchParams.get('n')
  url.searchParams.delete('n')
  const pathname = n ? `/n/${n}` : url.pathname
  if (url.origin === location.origin && pathname.startsWith('/n/')) return pathname + url.search
}
