type CompanyLookupLinksProps = {
  companyName: string
  domain?: string
  telephone?: string
  compact?: boolean
}

function websiteUrl(domain: string) {
  const value = domain.trim()
  if (!value) return ''
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

function searchUrl(query: string) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`
}

export default function CompanyLookupLinks({
  companyName,
  domain = '',
  telephone = '',
  compact = false,
}: CompanyLookupLinksProps) {
  const cleanDomain = domain
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/.*$/, '')
    .trim()
  const identifyingDetails = [companyName, cleanDomain, telephone].filter(Boolean).join(' ')
  const links = [
    websiteUrl(domain)
      ? { label: 'Website', href: websiteUrl(domain) }
      : null,
    {
      label: 'Google',
      href: searchUrl(identifyingDetails),
    },
    {
      label: 'Maps',
      href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(identifyingDetails)}`,
    },
    {
      label: 'Companies House',
      href: `https://find-and-update.company-information.service.gov.uk/search/companies?q=${encodeURIComponent(companyName)}`,
    },
    cleanDomain
      ? {
          label: 'Find address',
          href: searchUrl(`site:${cleanDomain} contact address postcode`),
        }
      : null,
    telephone
      ? {
          label: 'Phone search',
          href: searchUrl(`"${telephone}"`),
        }
      : null,
  ].filter((link): link is { label: string; href: string } => Boolean(link))

  return (
    <div className={`flex flex-wrap ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className={
            compact
              ? 'rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-700 transition hover:border-red-300 hover:text-red-700'
              : 'rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-700'
          }
        >
          {link.label} ↗
        </a>
      ))}
    </div>
  )
}
