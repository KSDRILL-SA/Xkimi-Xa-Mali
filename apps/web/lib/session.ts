import { cache } from 'react'
import { auth } from '@/lib/auth'

// Deduplicate auth() calls within a single React render pass.
// Layout and page components share the same session object without
// triggering a second JWT decode per navigation.
export const getSession = cache(auth)
