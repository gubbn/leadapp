import type { SupabaseClient } from '@supabase/supabase-js'

export const customerCompanyTags = ['#customer'] as const
const customerTagCleanupKey = 'company-customer-tag-cleanup-v1'

export function normaliseCompanyTag(value: string) {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return cleaned ? `#${cleaned}` : ''
}

export function parseCompanyTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,]+/)
        .map(normaliseCompanyTag)
        .filter(Boolean),
    ),
  ).sort()
}

export function readCompanyTags(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .filter((tag): tag is string => typeof tag === 'string')
          .map(normaliseCompanyTag)
          .filter(Boolean),
      ),
    ).sort()
  }

  return typeof value === 'string' ? parseCompanyTags(value) : []
}

export function companyTagsToInput(value: unknown) {
  return readCompanyTags(value).join(' ')
}

export function hasCustomerCompanyTag(value: unknown) {
  const tags = readCompanyTags(value)
  return customerCompanyTags.some((tag) => tags.includes(tag))
}

export function hasAnyCompanyTag(value: unknown, selectedTags: string[]) {
  if (!selectedTags.length) return false
  const tags = new Set(readCompanyTags(value))
  return selectedTags.some((tag) => tags.has(normaliseCompanyTag(tag)))
}

export async function removeExistingCustomerTagsOnce(client: SupabaseClient) {
  if (typeof window !== 'undefined' && window.localStorage.getItem(customerTagCleanupKey) === 'complete') return 0

  const { data, error } = await client
    .from('companies')
    .select('id,tags')
    .contains('tags', ['#customer'])
  if (error) throw error

  for (const company of data ?? []) {
    const tags = readCompanyTags(company.tags).filter((tag) => tag !== '#customer')
    const result = await client
      .from('companies')
      .update({ tags })
      .eq('id', company.id)
      .select('id')
      .single()
    if (result.error) throw result.error
  }

  const verification = await client
    .from('companies')
    .select('id', { count: 'exact', head: true })
    .contains('tags', ['#customer'])
  if (verification.error) throw verification.error
  if (verification.count) throw new Error(`${verification.count} customer tags could not be removed.`)

  if (typeof window !== 'undefined') window.localStorage.setItem(customerTagCleanupKey, 'complete')
  return data?.length ?? 0
}
