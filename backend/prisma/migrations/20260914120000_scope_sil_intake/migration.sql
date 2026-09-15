-- Existing rows remain unowned until an operator verifies their provenance.
ALTER TABLE "Datasource" ADD COLUMN "orgScope" TEXT;
ALTER TABLE "Job" ADD COLUMN "orgScope" TEXT;
ALTER TABLE "Job" ADD COLUMN "dataSourceRef" TEXT;

CREATE INDEX "Datasource_orgScope_idx" ON "Datasource"("orgScope");
CREATE INDEX "Job_orgScope_idx" ON "Job"("orgScope");
