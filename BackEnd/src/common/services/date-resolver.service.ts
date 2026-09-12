import { Injectable, Logger } from '@nestjs/common';

export interface TemporalInput {
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string;
}

export interface ResolvedTemporal {
  date: string | null; // Formatted YYYY-MM-DD
  startTime: string | null; // e.g. "09:00" or preserved input
  endTime: string | null; // e.g. "17:00" or preserved input
  originalExpression: string | null;
}

@Injectable()
export class DateResolverService {
  private readonly logger = new Logger(DateResolverService.name);

  /**
   * Resolves natural-language temporal expressions into normalized dates and times.
   */
  resolveTemporal(
    input: TemporalInput,
    referenceDate: Date = new Date(),
  ): ResolvedTemporal {
    const rawDateExpr = input.date?.trim() || null;
    let startTime = input.startTime?.trim() || null;
    let endTime = input.endTime?.trim() || null;

    if (!rawDateExpr) {
      return {
        date: null,
        startTime,
        endTime,
        originalExpression: null,
      };
    }

    const tzParts = this.getTimezoneDateParts(referenceDate, input.timezone);
    const normalizedExpr = rawDateExpr.toLowerCase();

    let resolvedDateStr: string | null = null;
    let inferredStartTime: string | null = null;
    let inferredEndTime: string | null = null;

    // 1. "today" / "this morning" / "this afternoon" / "this evening"
    if (normalizedExpr.includes('today')) {
      resolvedDateStr = this.formatDateParts(tzParts.year, tzParts.month, tzParts.day);
    } else if (normalizedExpr.includes('tonight')) {
      resolvedDateStr = this.formatDateParts(tzParts.year, tzParts.month, tzParts.day);
      inferredStartTime = '19:00';
      inferredEndTime = '23:59';
    } else if (normalizedExpr.includes('day after tomorrow')) {
      // 2. "day after tomorrow"
      const target = new Date(tzParts.year, tzParts.month, tzParts.day + 2);
      resolvedDateStr = this.formatDate(target);
    } else if (normalizedExpr.includes('tomorrow morning')) {
      // 3. "tomorrow morning" / "tomorrow evening" / "tomorrow"
      const target = new Date(tzParts.year, tzParts.month, tzParts.day + 1);
      resolvedDateStr = this.formatDate(target);
      inferredStartTime = '08:00';
      inferredEndTime = '12:00';
    } else if (normalizedExpr.includes('tomorrow evening') || normalizedExpr.includes('tomorrow night')) {
      const target = new Date(tzParts.year, tzParts.month, tzParts.day + 1);
      resolvedDateStr = this.formatDate(target);
      inferredStartTime = '17:00';
      inferredEndTime = '22:00';
    } else if (normalizedExpr.includes('tomorrow')) {
      const target = new Date(tzParts.year, tzParts.month, tzParts.day + 1);
      resolvedDateStr = this.formatDate(target);
    } else if (normalizedExpr.includes('weekend')) {
      // 4. "this weekend" / "weekend"
      // If current day is Sunday (0), "this weekend" refers to today
      if (tzParts.dayOfWeek === 0 && normalizedExpr.includes('this weekend')) {
        resolvedDateStr = this.formatDateParts(tzParts.year, tzParts.month, tzParts.day);
      } else {
        const daysUntilSaturday = (6 - tzParts.dayOfWeek + 7) % 7;
        const saturday = new Date(tzParts.year, tzParts.month, tzParts.day + daysUntilSaturday);
        resolvedDateStr = this.formatDate(saturday);
      }
    } else {
      // 5. Day names e.g. "next monday", "this friday", "tuesday"
      const dayMatch = this.resolveDayName(normalizedExpr, tzParts);
      if (dayMatch) {
        resolvedDateStr = dayMatch;
      } else {
        // 6. Direct YYYY-MM-DD match
        const isoMatch = normalizedExpr.match(/\b\d{4}-\d{2}-\d{2}\b/);
        if (isoMatch) {
          resolvedDateStr = isoMatch[0];
        }
      }
    }

    // Preserve explicitly provided startTime / endTime over inferred defaults
    if (!startTime && inferredStartTime) {
      startTime = inferredStartTime;
    }
    if (!endTime && inferredEndTime) {
      endTime = inferredEndTime;
    }

    return {
      date: resolvedDateStr,
      startTime,
      endTime,
      originalExpression: rawDateExpr,
    };
  }

  /**
   * Helper to extract date components adjusted for a given timezone.
   */
  private getTimezoneDateParts(
    date: Date,
    timeZone?: string,
  ): { year: number; month: number; day: number; dayOfWeek: number } {
    if (!timeZone) {
      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        dayOfWeek: date.getDay(),
      };
    }

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        weekday: 'short',
      });
      const parts = formatter.formatToParts(date);
      let month = 0;
      let day = 1;
      let year = 2026;
      let weekdayStr = '';

      for (const p of parts) {
        if (p.type === 'month') month = parseInt(p.value, 10) - 1;
        if (p.type === 'day') day = parseInt(p.value, 10);
        if (p.type === 'year') year = parseInt(p.value, 10);
        if (p.type === 'weekday') weekdayStr = p.value;
      }

      const dayOfWeekMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
      };
      const dayOfWeek = dayOfWeekMap[weekdayStr] ?? date.getDay();

      return { year, month, day, dayOfWeek };
    } catch (err: any) {
      this.logger.warn(`Invalid timezone "${timeZone}". Falling back to server timezone.`);
      return {
        year: date.getFullYear(),
        month: date.getMonth(),
        day: date.getDate(),
        dayOfWeek: date.getDay(),
      };
    }
  }

  /**
   * Resolves day names e.g. "next Monday", "Friday" into YYYY-MM-DD.
   */
  private resolveDayName(
    expression: string,
    tzParts: { year: number; month: number; day: number; dayOfWeek: number },
  ): string | null {
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
      if (expression.includes(dayName)) {
        let diff = targetDayNum - tzParts.dayOfWeek;
        if (diff <= 0) {
          diff += 7;
        }
        const target = new Date(tzParts.year, tzParts.month, tzParts.day + diff);
        return this.formatDate(target);
      }
    }

    return null;
  }

  private formatDate(d: Date): string {
    return this.formatDateParts(d.getFullYear(), d.getMonth(), d.getDate());
  }

  private formatDateParts(year: number, month: number, day: number): string {
    const yyyy = year;
    const mm = String(month + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
