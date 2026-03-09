import { Module, Global } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaMetadataResolver } from './resolvers/prisma-metadata.resolver';
import { PrismaResourcePolicyResolver } from './resolvers/prisma-resource-policy.resolver';

@Global()
@Module({
    providers: [PrismaService, PrismaMetadataResolver, PrismaResourcePolicyResolver],
    exports: [PrismaService, PrismaMetadataResolver, PrismaResourcePolicyResolver],
})
export class DatabaseModule { }
