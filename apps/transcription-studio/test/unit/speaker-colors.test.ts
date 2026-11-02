import { expect, test } from 'bun:test'
import { speakerColor, speakerColorAt } from '../../shared/speakerColors'

test('speaker colors use the requested one-based sequence everywhere', () => {
  const expected = ['fb-primary', 'green-400', 'red-400', 'yellow-400', 'purple-400', 'orange-400']
  expected.forEach((color, index) => {
    expect(speakerColorAt(index + 1).color).toContain(color)
    expect(speakerColor(`id-${index}`, expected.map((_, i) => `id-${i}`))).toEqual(speakerColorAt(index + 1))
  })
})

test('additional speaker colors are deterministic and invalid sequences are neutral', () => {
  expect(speakerColorAt(7)).toEqual(speakerColorAt(7))
  expect(speakerColorAt(7)).not.toEqual(speakerColorAt(8))
  for (const sequence of [0, -1, 1.5, NaN, Infinity]) expect(speakerColorAt(sequence)).toEqual({})
  expect(speakerColor(undefined, ['a'])).toEqual({})
  expect(speakerColor('unknown', ['a'])).toEqual({})
})
