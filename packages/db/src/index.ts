import { PrismaClient } from "@prisma/client";

/**
 * Tek Prisma istemcisi. Geliştirmede sıcak yeniden yüklemede bağlantı sayısı artmasın diye
 * global'de saklanır.
 */
const g = globalThis as unknown as { __hfoPrisma?: PrismaClient };

export const prisma: PrismaClient = g.__hfoPrisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.__hfoPrisma = prisma;

export * from "@prisma/client";
