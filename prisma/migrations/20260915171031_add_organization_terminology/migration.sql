-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "labelOverrides" JSONB,
ADD COLUMN     "labelOverridesSetAt" TIMESTAMP(3),
ADD COLUMN     "labelOverridesSetById" TEXT;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_labelOverridesSetById_fkey" FOREIGN KEY ("labelOverridesSetById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
