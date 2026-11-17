export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif'

export const SUPPORTED_FORMATS_TEXT = 'PNG, JPEG, WebP or GIF'

const ascii = (b: Uint8Array, from: number, text: string) => text.split('').every((c, i) => b[from + i] === c.charCodeAt(0))

/**
 * Recognise an image by its first bytes, not by its file name (names lie, and phones often hand over files without
 * an extension). Returns null for anything that is not one of the supported formats.
 */
export function detectImageFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => bytes[i] === v)) return 'png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (bytes.length >= 6 && (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a'))) return 'gif'
  if (bytes.length >= 12 && ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return 'webp'
  return null
}

export function unsupportedFileMessage(fileName?: string): string {
  const what = fileName ? `“${fileName}”` : 'That file'
  return `${what} is not a supported picture. Choose a ${SUPPORTED_FORMATS_TEXT} file.`
}

/** File name without its extension, for naming the new design. */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').trim()
  return base.slice(0, 60) || 'Imported'
}
