import { describe, expect, test } from 'bun:test'
import { normaliseDirectoryPath } from '../../shared/normaliseDirectoryPath'

describe('directory path normalisation', () => {
  test.each([
    ['/Users/james/Audio', '/Users/james/Audio'],
    ['  /Users/james/Audio  \n', '/Users/james/Audio'],
    ['"/Users/james/Audio"', '/Users/james/Audio'],
    ["'/Users/james/Audio'", '/Users/james/Audio'],
    ['“/Users/james/Audio”', '/Users/james/Audio'],
    ['‘/Users/james/Audio’', '/Users/james/Audio'],
    ['  “ \'"/Users/james/Audio"\' ”  ', '/Users/james/Audio'],
    ["/Users/james/James's Audio", "/Users/james/James's Audio"],
    ['"/Users/james/Audio \'session\' and “notes”"', '/Users/james/Audio \'session\' and “notes”'],
    ['"/Users/james/Audio\'', '"/Users/james/Audio\''],
    ['“/Users/james/Audio“', '“/Users/james/Audio“'],
    ['', ''],
    ['   ', ''],
    ['""', ''],
  ])('normalises %j without changing internal quotes', (input, expected) => {
    expect(normaliseDirectoryPath(input)).toBe(expected)
    expect(normaliseDirectoryPath(normaliseDirectoryPath(input))).toBe(expected)
  })
})
