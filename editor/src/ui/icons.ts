/**
 * The icon set: every icon is a 7x7 grid of dots drawn from a string map ('#' = lit dot), the same material as the
 * Glyph Matrix itself. One style, one grid size; the Icon component renders them as SVG circles.
 */
export const GRID = 7

const rows = (s: string) => s.trim().split('\n').map((r) => r.trim())

const diag = rows(`
.....##
....###
...###.
..###..
.###...
###....
##.....`)

const chevLeft = rows(`
....#..
...#...
..#....
.#.....
..#....
...#...
....#..`)
const chevRight = chevLeft.map((r) => [...r].reverse().join(''))
const chevUp = rows(`
.......
...#...
..#.#..
.#...#.
#.....#
.......
.......`)
const chevDown = [...chevUp].reverse()

const mirrorV = rows(`
...#...
.#.#.#.
##.#.##
#..#..#
##.#.##
.#.#.#.
...#...`)
const transpose = (g: string[]) => g[0].split('').map((_, x) => g.map((r) => r[x]).join(''))

const flipHGrid = rows(`
...#...
#..#..#
##.#.##
###.###
##.#.##
#..#..#
...#...`)

export const ICONS = {
  back: { grid: chevLeft },
  undo: { grid: rows(`
..#....
.##....
#######
.##...#
..#...#
.....##
...###.`) },
  redo: { grid: rows(`
....#..
....##.
#######
#...##.
#....#.
##.....
.###...`) },
  pen: { grid: diag },
  eraser: { grid: rows(`
...###.
..####.
.####..
####...
###....
.......
#######`) },
  fill: { grid: rows(`
..##...
.####..
######.
######.
.####.#
..##..#
.......`) },
  line: { grid: rows(`
#......
.#.....
..#....
...#...
....#..
.....#.
......#`) },
  rect: { grid: rows(`
#######
#.....#
#.....#
#.....#
#.....#
#.....#
#######`) },
  rectFill: { grid: rows(`
#######
#######
#######
#######
#######
#######
#######`) },
  ellipse: { grid: rows(`
..###..
.#...#.
#.....#
#.....#
#.....#
.#...#.
..###..`) },
  ellipseFill: { grid: rows(`
..###..
.#####.
#######
#######
#######
.#####.
..###..`) },
  mirrorX: { grid: mirrorV },
  mirrorY: { grid: transpose(mirrorV) },
  clear: { grid: rows(`
..###..
#######
.#...#.
.#.#.#.
.#.#.#.
.#...#.
.#####.`) },
  flipH: { grid: flipHGrid },
  flipV: { grid: transpose(flipHGrid) },
  left: { grid: chevLeft },
  right: { grid: chevRight },
  up: { grid: chevUp },
  down: { grid: chevDown },
  prev: { grid: chevLeft },
  next: { grid: chevRight },
  play: { grid: rows(`
##.....
####...
######.
#######
######.
####...
##.....`) },
  stop: { grid: rows(`
.......
.#####.
.#####.
.#####.
.#####.
.#####.
.......`) },
  text: { grid: rows(`
#######
#######
..###..
..###..
..###..
..###..
..###..`) },
  copy: { grid: rows(`
..#####
..#...#
#####.#
#...#.#
#...###
#...#..
#####..`) },
  keyboard: { grid: rows(`
#######
#.....#
#.#.#.#
#.....#
#.#.#.#
#.....#
#######`) },
  save: { grid: rows(`
#####..
#.#.##.
#.#.###
#.....#
#.###.#
#.###.#
#######`) },
  check: { grid: rows(`
.......
......#
.....#.
#...#..
.#.#...
..#....
.......`) },
  select: { grid: rows(`
#.#.#.#
.......
#.....#
.......
#.....#
.......
#.#.#.#`) },
  lasso: { grid: rows(`
..###..
.#...#.
#.....#
.#...#.
..###..
...#...
...##..`) },
  rotateL: { grid: rows(`
###.###
.#...#.
#.....#
#.....#
.#...#.
..###..
.......`) },
  rotateR: { grid: rows(`
###.###
.#...#.
#.....#
#.....#
.#...#.
..###..
.......`) },
  cut: { grid: rows(`
#.....#
.#...#.
..#.#..
...#...
..#.#..
.#...#.
#.....#`) },
  matrix: { grid: rows(`
..###..
.#...#.
#..#..#
#.###.#
#..#..#
.#...#.
..###..`) },
  more: { grid: rows(`
.......
.......
.......
.#.#.#.
.......
.......
.......`) },
  share: { grid: rows(`
...#...
..###..
.#.#.#.
...#...
#.....#
#.....#
#######`) },
  paste: { grid: rows(`
..###..
#.###.#
#.....#
#.###.#
#.....#
#.###.#
#######`) },
} satisfies Record<string, { grid: string[] }>

export type IconName = keyof typeof ICONS
