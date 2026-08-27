import type { Metadata } from 'next'

// The page itself is a client component, and a client component cannot export
// `metadata` — which is why this was the one member route whose tab read
// "Xkimi Xa Mali Foundation" with no page name while every sibling read
// "<Page> | Xkimi Xa Mali Foundation". A layout is a server component, so the
// title belongs here.
export const metadata: Metadata = { title: 'Make a Contribution' }

export default function ContributeLayout({ children }: { children: React.ReactNode }) {
  return children
}
