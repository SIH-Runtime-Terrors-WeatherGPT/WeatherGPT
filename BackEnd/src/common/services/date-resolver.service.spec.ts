import { Test, TestingModule } from '@nestjs/testing';
import { DateResolverService } from './date-resolver.service';

describe('DateResolverService', () => {
  let service: DateResolverService;
  // Saturday, September 12, 2026
  const refDate = new Date(2026, 8, 12, 14, 0, 0);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DateResolverService],
    }).compile();

    service = module.get<DateResolverService>(DateResolverService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('resolveTemporal', () => {
    it('should return date: null for missing input date', () => {
      const result = service.resolveTemporal({}, refDate);
      expect(result).toEqual({
        date: null,
        startTime: null,
        endTime: null,
        originalExpression: null,
      });
    });

    it('should resolve "today"', () => {
      const result = service.resolveTemporal({ date: 'today' }, refDate);
      expect(result.date).toBe('2026-09-12');
      expect(result.originalExpression).toBe('today');
    });

    it('should resolve "tomorrow"', () => {
      const result = service.resolveTemporal({ date: 'tomorrow' }, refDate);
      expect(result.date).toBe('2026-09-13');
    });

    it('should resolve "tonight" and set default start/end times', () => {
      const result = service.resolveTemporal({ date: 'tonight' }, refDate);
      expect(result.date).toBe('2026-09-12');
      expect(result.startTime).toBe('19:00');
      expect(result.endTime).toBe('23:59');
    });

    it('should resolve "tomorrow morning" and default times', () => {
      const result = service.resolveTemporal({ date: 'tomorrow morning' }, refDate);
      expect(result.date).toBe('2026-09-13');
      expect(result.startTime).toBe('08:00');
      expect(result.endTime).toBe('12:00');
    });

    it('should resolve "tomorrow evening" and default times', () => {
      const result = service.resolveTemporal({ date: 'tomorrow evening' }, refDate);
      expect(result.date).toBe('2026-09-13');
      expect(result.startTime).toBe('17:00');
      expect(result.endTime).toBe('22:00');
    });

    it('should resolve "this weekend"', () => {
      // refDate is Saturday Sep 12, 2026
      const result = service.resolveTemporal({ date: 'this weekend' }, refDate);
      expect(result.date).toBe('2026-09-12');
    });

    it('should resolve "next Monday"', () => {
      // refDate is Saturday Sep 12. Next Monday is Sep 14
      const result = service.resolveTemporal({ date: 'next Monday' }, refDate);
      expect(result.date).toBe('2026-09-14');
    });

    it('should preserve explicitly provided startTime and endTime', () => {
      const result = service.resolveTemporal(
        {
          date: 'tomorrow morning',
          startTime: '09:30',
          endTime: '11:00',
        },
        refDate,
      );

      expect(result.date).toBe('2026-09-13');
      expect(result.startTime).toBe('09:30'); // Preserved!
      expect(result.endTime).toBe('11:00'); // Preserved!
    });

    it('should handle invalid or ambiguous temporal expressions safely', () => {
      const result = service.resolveTemporal(
        { date: 'unknown random date string' },
        refDate,
      );

      expect(result).toEqual({
        date: null,
        startTime: null,
        endTime: null,
        originalExpression: 'unknown random date string',
      });
    });

    it('should handle timezone parameter correctly', () => {
      const result = service.resolveTemporal(
        {
          date: 'today',
          timezone: 'America/New_York',
        },
        new Date('2026-09-13T01:00:00Z'), // 01:00 UTC on Sep 13 is 21:00 on Sep 12 in New York
      );

      expect(result.date).toBe('2026-09-12');
    });
  });
});
