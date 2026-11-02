import { expect, test } from 'bun:test'
import { timelineTurnText } from '../../app/utils/timelineTurnText'

test('joins overlapping text for this speaker and excludes simultaneous other speakers and adjacent turns', () => {
  expect(timelineTurnText({ start: 2, end: 6, speaker: 'a' }, [
    { start: 0, end: 2, speaker: 'a', text: 'Before.' },
    { start: 1, end: 3, speaker: 'a', text: ' First. ' },
    { start: 3, end: 5, speaker: 'b', text: 'Other speaker.' },
    { start: 3, end: 5, speaker: 'a', text: 'Second.' },
    { start: 5, end: 7, text: 'Unlabelled.' },
    { start: 6, end: 8, speaker: 'a', text: 'After.' },
  ])).toBe('First. Second. Unlabelled.')
})

test('returns empty text when no transcript segment matches', () => {
  expect(timelineTurnText({ start: 2, end: 6, speaker: 'a' }, [])).toBe('')
})
