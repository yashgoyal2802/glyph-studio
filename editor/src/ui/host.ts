/**
 * Which screen the editor is running on. The app's own screen (a WebView) gets a bridge object named GlyphAndroid from
 * the phone; a computer's browser never has it. Phone-only things (opening Android settings, the share sheet) check this.
 */
export const isInApp = (): boolean => typeof (globalThis as { GlyphAndroid?: unknown }).GlyphAndroid !== 'undefined'
