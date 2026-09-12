import { resolveNaturalLanguageDate } from './date-resolver.util';

describe('date-resolver.util', () => {
  // Fix reference date to Saturday, September 12, 2026
  const refDate = new Date(2026, 8, 12); // Month is 0-indexed (8 = September)

  it('should return null for empty or null inputs', () => {
    expect(resolveNaturalLanguageDate(null, refDate)).toBeNull();
    expect(resolveNaturalLanguageDate('', refDate)).toBeNull();
    expect(resolveNaturalLanguageDate('  ', refDate)).toBeNull();
    expect(resolveNaturalLanguageDate('null', refDate)).toBeNull();
  });

  it('should resolve "today" and "tonight"', () => {
    expect(resolveNaturalLanguageDate('today', refDate)).toBe('2026-09-12');
    expect(resolveNaturalLanguageDate('tonight', refDate)).toBe('2026-09-12');
    expect(resolveNaturalLanguageDate('this morning', refDate)).toBe('2026-09-12');
  });

  it('should resolve "tomorrow", "tomorrow morning", "tomorrow evening"', () => {
    expect(resolveNaturalLanguageDate('tomorrow', refDate)).toBe('2026-09-13');
    expect(resolveNaturalLanguageDate('tomorrow morning', refDate)).toBe('2026-09-13');
    expect(resolveNaturalLanguageDate('tomorrow evening', refDate)).toBe('2026-09-13');
  });

  it('should resolve "day after tomorrow"', () => {
    expect(resolveNaturalLanguageDate('day after tomorrow', refDate)).toBe('2026-09-14');
  });

  it('should resolve "this weekend"', () => {
    // refDate (2026-09-12) is a Saturday
    expect(resolveNaturalLanguageDate('this weekend', refDate)).toBe('2026-09-12');
  });

  it('should resolve "next Monday"', () => {
    // 2026-09-12 is Saturday. Next Monday is 2026-09-14
    expect(resolveNaturalLanguageDate('next Monday', refDate)).toBe('2026-09-14');
  });

  it('should resolve "next Friday"', () => {
    // 2026-09-12 is Saturday. Next Friday is 2026-09-18
    expect(resolveNaturalLanguageDate('next Friday', refDate)).toBe('2026-09-18');
  });

  it('should parse ISO date string if passed directly', () => {
    expect(resolveNaturalLanguageDate('2026-10-01', refDate)).toBe('2026-10-01');
  });
});
