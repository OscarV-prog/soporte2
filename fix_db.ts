import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('Creating missing tables...');

    // Create system_configs
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'system_configs' AND schema_id = SCHEMA_ID('dbo'))
      BEGIN
        CREATE TABLE dbo.system_configs (
          [key] NVARCHAR(1000) PRIMARY KEY,
          value NVARCHAR(MAX) NOT NULL,
          updated_at DATETIME2 NOT NULL DEFAULT GETDATE()
        );
      END
    `);

    // Create users
    await prisma.$executeRawUnsafe(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'users' AND schema_id = SCHEMA_ID('dbo'))
      BEGIN
        CREATE TABLE dbo.users (
          id NVARCHAR(36) PRIMARY KEY DEFAULT NEWID(),
          email NVARCHAR(255) NOT NULL UNIQUE,
          password_hash NVARCHAR(MAX) NOT NULL,
          role NVARCHAR(50) NOT NULL DEFAULT 'OPERATOR',
          created_at DATETIME2 NOT NULL DEFAULT GETDATE()
        );
      END
    `);

    console.log('Database fix completed.');
  } catch (error) {
    console.error('Error fixing database:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
