'use client'

import { Smile } from 'lucide-react'
import { Dropdown, DropdownTrigger, DropdownContent, useDropdown } from '@xxm/ui'
import { EMOJIS } from './message-types'

/**
 * Split out from EmojiPicker because `useDropdown()` only works inside the
 * `<Dropdown>` provider's own descendants — calling it in the component that
 * renders `<Dropdown>` itself throws, since the provider isn't mounted yet
 * at that point in the tree.
 */
function EmojiGrid({ onPick }: { onPick: (emoji: string) => void }) {
  const { close } = useDropdown()
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => { onPick(emoji); close() }}
          className="w-7 h-7 rounded-lg text-lg leading-none flex items-center justify-center hover:bg-xxm-green-50 transition-colors"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}

// Was its own `absolute bottom-full` popup, positioned relative to the
// composer. That composer lives inside MessageBoard's outer card
// (`overflow-hidden`, for its rounded corners) — and is reused again inline
// inside MessageItem for edit/reply, anywhere in a scrollable message list.
// A popup that opens upward next to its trigger gets its top edge clipped by
// that ancestor's boundary the moment the trigger is near the top of the
// card ("the top of it get lost... you only see the lower part of emojis").
// Flipping the open direction only moves the same bug to whichever end of
// the list is now too close to an edge.
//
// @xxm/ui's Dropdown already solves exactly this — portals the panel to
// `document.body` and positions it with `fixed` coordinates measured from
// the trigger, so no ancestor's overflow can clip it. Reusing it here
// instead of maintaining a second, narrower copy of the same fix.
//
// `align="center"`, not the default right-anchor: this is a wide 256px grid
// opened from a small icon that sits wherever it sits in the composer's
// toolbar — often left-of-centre on a phone, unlike a typical dropdown
// trigger near the edge of its own container. Right-anchoring it pushed the
// panel's left edge off-screen ("faded sideways... I only see half of it").
// Centring under the trigger, with the clamp `DropdownContent` now applies,
// keeps the whole grid on screen regardless of where the button sits.
export function EmojiPicker({ onPick }: { onPick: (emoji: string) => void }) {
  return (
    <Dropdown>
      <DropdownTrigger
        className="w-8 h-8 rounded-lg flex items-center justify-center text-xxm-gray-400 hover:text-xxm-gold-dark hover:bg-xxm-gold/10 transition-colors"
      >
        <Smile size={17} aria-hidden />
        <span className="sr-only">Add emoji</span>
      </DropdownTrigger>
      <DropdownContent align="center" className="w-64 p-2.5">
        <EmojiGrid onPick={onPick} />
      </DropdownContent>
    </Dropdown>
  )
}
