/**
 * Resolves natural language date expressions (e.g. "today", "tomorrow", "this weekend", "next Monday")
 * into formatted YYYY-MM-DD ISO date strings based on a reference date (default: today).
 */
export function resolveNaturalLanguageDate(
  expression: string | null | undefined,
  refDate: Date = new Date(),
): string | null {
  if (!expression || typeof expression !== 'string') return null;

  const normalized = expression.trim().toLowerCase();
  if (!normalized || normalized === 'null') return null;

  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const day = refDate.getDate();

  const formatDate = (d: Date): string => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // 1. Today / tonight / this morning / this afternoon / this evening
  if (
    normalized.includes('today') ||
    normalized.includes('tonight') ||
    normalized.includes('this morning') ||
    normalized.includes('this afternoon') ||
    normalized.includes('this evening')
  ) {
    return formatDate(refDate);
  }

  // 2. Day after tomorrow
  if (normalized.includes('day after tomorrow')) {
    const target = new Date(year, month, day + 2);
    return formatDate(target);
  }

  // 3. Tomorrow / tomorrow morning / tomorrow evening / tomorrow night
  if (normalized.includes('tomorrow')) {
    const target = new Date(year, month, day + 1);
    return formatDate(target);
  }

  // 4. Weekend ("this weekend", "the weekend", "weekend")
  if (normalized.includes('weekend')) {
    const currentDayOfWeek = refDate.getDay(); // 0 = Sun, 6 = Sat
    if (currentDayOfWeek === 0 && normalized.includes('this weekend')) {
      return formatDate(refDate);
    }
    const daysUntilSaturday = (6 - currentDayOfWeek + 7) % 7;
    const saturday = new Date(year, month, day + daysUntilSaturday);
    return formatDate(saturday);
  }

  // 5. Day names (e.g. "next Monday", "this Friday", "Monday")
  const daysMap: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  for (const [dayName, targetDayNum] of Object.entries(daysMap)) {
    if (normalized.includes(dayName)) {
      const currentDayOfWeek = refDate.getDay();
      let diff = targetDayNum - currentDayOfWeek;
      if (diff <= 0) {
        diff += 7;
      }
      const target = new Date(year, month, day + diff);
      return formatDate(target);
    }
  }

  // 6. Direct YYYY-MM-DD string format
  const isoMatch = normalized.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoMatch) {
    return isoMatch[0];
  }

  return null;
}
