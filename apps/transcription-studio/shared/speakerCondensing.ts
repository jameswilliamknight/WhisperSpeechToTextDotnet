import type { SpeakerTurn, TranscriptSegment } from './studio'
import { alignedWords } from './wordAlignment'
import { wordOwner } from './wordSpeaker'
import { processingOptions } from './transcriptProcessing'
import type { TranscriptProcessing } from './transcriptProcessing'

type Segment = Readonly<TranscriptSegment>
type Turns = readonly Readonly<SpeakerTurn>[]

// Projected slices no longer have their original neighbours. Retain their
// derived owners out-of-band so highlights cannot silently guess differently.
// Weak keys keep this ephemeral; nothing is written into persisted results.
const projectedOwners = new WeakMap<Segment, { turns: Turns; owners: readonly number[]; signature: string }>()

export function retainSpeakerOwners(segment: Segment, turns: Turns, owners: readonly number[], input?: Partial<TranscriptProcessing>) {
  projectedOwners.set(segment, { turns, owners, signature: JSON.stringify(processingOptions(input)) })
}

/** One non-cascading pass: inferred words never become evidence for another
 * correction. Word count alone must not erase a genuine short interjection. */
export function condensedOwners(segments: readonly Segment[], turns: Turns, input?: Partial<TranscriptProcessing>): readonly (readonly number[])[] {
  const options = processingOptions(input)
  const signature = JSON.stringify(options)
  const rows = segments.map((segment, segmentIndex) => {
    const retained = projectedOwners.get(segment)
    const fixed = retained?.turns === turns && retained.signature === signature
    return alignedWords(segment).map((word, index) => ({
      word, segment, segmentIndex, owner: fixed ? retained!.owners[index]! : wordOwner(word.start, word.end, turns, options.bridgeShortGaps), fixed,
    }))
  })
  const words = rows.flat()
  const owners = words.map(value => value.owner)
  const speaker = (index: number) => turns[words[index]?.owner ?? -1]?.speaker
  for (let first = 0; first < words.length;) {
    let end = first + 1
    while (end < words.length && speaker(end) === speaker(first)) end++
    const run = words.slice(first, end)
    const before = words[first - 1], after = words[end]
    const start = run[0]!.word.start, finish = run.at(-1)!.word.end
    const count = run.reduce((sum, value) => sum + value.segment.text.slice(value.word.from, value.word.to).trim().split(/\s+/).length, 0)
    const current = speaker(first)
    if (!before || !after || run.some(value => value.fixed) || count > 3 || finish - start > (current ? 1.2 : 1.5)
      || start < before.word.end || after.word.start < finish
      || start - before.word.end > 0.75 || after.word.start - finish > 0.75
      || after.word.start - before.word.end > 2.5
      || after.segmentIndex - before.segmentIndex > new Set([before.segment, ...run.map(value => value.segment), after.segment]).size - 1) { first = end; continue }
    const left = speaker(first - 1), right = speaker(end)
    let target: string | undefined
    if (options.condenseUnlabelled && !current && left && left === right) target = left
    else if (options.condenseUnlabelled && !current) {
      // At a real speaker change require an original segment label AND an
      // adjacent owned word in that same segment. Proximity alone is not enough.
      const source = run[0]!.segment
      if (run.every(value => value.segment === source) && source.speaker
        && ((source.speaker === left && before.segment === source)
          || (source.speaker === right && after.segment === source))) target = source.speaker
    }
    else if (options.smoothSpeakerIslands && current && left && left === right && run.every(value => value.segment.speaker === left)) {
      // A competing turn that covers most of even one word is a real possible
      // interjection, regardless of how few words it contains.
      if (run.every(({ word, owner }) => {
        const turn = turns[owner]!
        return turn.end - turn.start <= 1.2
          && Math.max(0, Math.min(word.end, turn.end) - Math.max(word.start, turn.start)) / (word.end - word.start) < 0.6
      })) target = left
    }
    if (target) {
      // At a change boundary, a two-speaker tie can use two independent votes:
      // the original segment label and its adjacent owned word. A third speaker,
      // missing source label, or disagreement still leaves the fragment explicit.
      const competing = !current && run.some(({ word }) => turns.some(turn => turn.speaker !== target
        && Math.min(word.end, turn.end) > Math.max(word.start, turn.start)))
      const supportedTie = !current && left !== right && run.every(({ word, segment }) => {
        const evidence = new Set(turns.filter(turn => Math.min(word.end, turn.end) > Math.max(word.start, turn.start)).map(turn => turn.speaker))
        return segment.speaker === target && evidence.has(target!) && evidence.size === 2
          && [...evidence].every(value => value === left || value === right)
          && ((before.segment === segment && left === target) || (after.segment === segment && right === target))
      })
      if (!competing || supportedTie) {
        const owner = left === target ? before.owner : after.owner
        for (let index = first; index < end; index++) owners[index] = owner
      }
    }
    first = end
  }
  let offset = 0
  return rows.map(row => { const result = owners.slice(offset, offset + row.length); offset += row.length; return result })
}
