import { Global, Module } from '@nestjs/common';
import { DateResolverService } from './services/date-resolver.service';

@Global()
@Module({
  providers: [DateResolverService],
  exports: [DateResolverService],
})
export class CommonModule {}
