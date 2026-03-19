import { Module } from '@nestjs/common';
import { TestOscarController } from './test-oscar.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TestOscarController],
})
export class TestOscarModule {}
