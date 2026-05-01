/** Defaults aligned with convex/userPreferences.ts */
export const DEFAULT_DAY_MIN_MINS = 450
export const DEFAULT_DAY_MAX_MINS = 480

export const EXPORT_COLUMN_KEYS = [
  'weekNo',
  'weekRange',
  'date',
  'day',
  'task',
  'hours',
  'dayTotal',
] as const

export type ExportColumnKey = (typeof EXPORT_COLUMN_KEYS)[number]
