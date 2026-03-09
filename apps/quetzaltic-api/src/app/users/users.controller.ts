import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
    constructor(private readonly usersService: UsersService) { }

    @Get()
    async findAll() {
        const users = await this.usersService.findAll();
        // Don't return hashes
        return users.map(({ passwordHash, ...user }) => user);
    }

    @Post()
    async create(@Body() data: any) {
        const user = await this.usersService.create(data);
        const { passwordHash, ...result } = user;
        return result;
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        return this.usersService.delete(id);
    }
}
