export function generatePages(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | 'ellipsis')[] = []
  if (current <= 3) {
    for (let i = 1; i <= 5; i++) pages.push(i)
    pages.push('ellipsis')
    pages.push(total)
  } else if (current >= total - 2) {
    pages.push(1)
    pages.push('ellipsis')
    for (let i = total - 4; i <= total; i++) pages.push(i)
  } else {
    pages.push(1)
    pages.push('ellipsis')
    for (let i = current - 1; i <= current + 1; i++) pages.push(i)
    pages.push('ellipsis')
    pages.push(total)
  }
  return pages
}
