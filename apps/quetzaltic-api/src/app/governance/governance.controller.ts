import {
    Controller,
    Get,
    Post,
    Body,
    Query,
    UseGuards,
    Headers,
    HttpCode,
    HttpStatus
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/guards/roles.decorator';
import { AuditStoreService, AuditFilter } from '../audit/audit-store.service';
import { LockdownService } from './lockdown.service';
import { WhitelistService } from './whitelist.service';

@Controller('governance')
@UseGuards(JwtAuthGuard, RolesGuard)
export class GovernanceController {
    constructor(
        private readonly auditStore: AuditStoreService,
        private readonly lockdownService: LockdownService,
        private readonly whitelistService: WhitelistService
    ) { }

    @Get('audit-logs')
    @Roles('ADMIN', 'OPERATOR')
    async getAuditLogs(
        @Query() query: any,
        @Query('includeSnapshots') includeSnapshots: string
    ) {
        const filter: AuditFilter = {
            page: query.page ? parseInt(query.page) : 1,
            limit: query.limit ? parseInt(query.limit) : 8,
            ticketId: query.ticketId,
            actor: query.actor,
            tableName: query.tableName,
            startDate: query.startDate ? new Date(query.startDate) : undefined,
            endDate: query.endDate ? new Date(query.endDate) : undefined,
            includeSnapshots: includeSnapshots === 'true',
            grouped: query.grouped === 'true'
        };

        if (filter.grouped) {
            return this.auditStore.findGrouped(filter);
        }
        return this.auditStore.findMany(filter);
    }

    @Get('stats')
    @Roles('ADMIN', 'OPERATOR')
    async getStats() {
        return this.auditStore.getStats();
    }

    @Get('lockdown/status')
    @Roles('ADMIN', 'OPERATOR')
    async getLockdownStatus() {
        const active = await this.lockdownService.isActive();
        return { active };
    }

    @Post('lockdown/toggle')
    @HttpCode(HttpStatus.OK)
    @Roles('ADMIN')
    async toggleLockdown(
        @Body('active') active: boolean,
        @Headers('x-actor') actor: string, // En un sistema real vendría del JWT, pero seguimos el patrón actual
        @Headers('x-correlation-id') correlationId: string
    ) {
        await this.lockdownService.setLockdown(active, actor || 'admin_user', correlationId || 'gov_lock_' + Date.now());
        return { status: 'SUCCESS', active };
    }

    @Get('whitelist')
    @Roles('ADMIN', 'OPERATOR')
    async getWhitelist() {
        return this.whitelistService.findAll();
    }

    @Post('whitelist')
    @Roles('ADMIN')
    async createWhitelistEntry(
        @Body() data: any,
        @Headers('x-actor') actor: string,
        @Headers('x-correlation-id') correlationId: string
    ) {
        return this.whitelistService.create(data, actor || 'admin_user', correlationId || 'gov_wl_' + Date.now());
    }

    @Post('whitelist/update')
    @Roles('ADMIN')
    async updateWhitelistEntry(
        @Body('id') id: string,
        @Body('isEditable') isEditable: boolean,
        @Headers('x-actor') actor: string,
        @Headers('x-correlation-id') correlationId: string
    ) {
        return this.whitelistService.update(id, { isEditable }, actor || 'admin_user', correlationId || 'gov_wl_upd_' + Date.now());
    }

    @Post('whitelist/delete')
    @Roles('ADMIN')
    async deleteWhitelistEntry(
        @Body('id') id: string,
        @Headers('x-actor') actor: string,
        @Headers('x-correlation-id') correlationId: string
    ) {
        await this.whitelistService.delete(id, actor || 'admin_user', correlationId || 'gov_wl_del_' + Date.now());
        return { status: 'SUCCESS' };
    }
}
