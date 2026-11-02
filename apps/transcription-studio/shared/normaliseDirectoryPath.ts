/** Finder/shell copies may wrap the whole path; quotes inside directory names remain literal. */
export function normaliseDirectoryPath(path: string): string {
  let value = path.trim()
  const pairs: Readonly<Record<string, string>> = { '"': '"', "'": "'", '“': '”', '‘': '’' }
  while (value.length >= 2 && pairs[value[0]!] === value.at(-1)) value = value.slice(1, -1).trim()
  return value
}
