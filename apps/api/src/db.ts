import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export async function connectDatabase() {
  try {
    await prisma.$connect();
    console.log('[DB] Connected successfully to PostgreSQL authoritative database.');
  } catch (error) {
    console.error('[DB] Failed to connect to PostgreSQL database:', error);
    throw error;
  }
}
