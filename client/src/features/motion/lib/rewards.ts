import type { DailyMissionProgress, WorkoutSession } from '../types'

export const requiredXp = (level: number) => 300 + (Math.max(1, level) - 1) * 100

export const localDateKey = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

export function calculateDailyMissionProgress(history: WorkoutSession[], date = new Date()): DailyMissionProgress {
  const dateKey = localDateKey(date)
  const today = history.filter(session => session.startTime && localDateKey(new Date(session.startTime)) === dateKey)
  return {
    date: dateKey,
    squatReps: today.reduce((sum, session) => sum + session.reps, 0),
    zone3Seconds: today.reduce((sum, session) => sum + session.zone3Seconds, 0),
    hasHighScoreWorkout: today.some(session => session.formScore >= 90),
  }
}

export function calculateStreakDays(history: WorkoutSession[]) {
  const trainedDates = new Set(history.filter(session => session.startTime).map(session => localDateKey(new Date(session.startTime))))
  let cursor = new Date(), streak = 0
  if (!trainedDates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  while (trainedDates.has(localDateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1) }
  return streak
}
