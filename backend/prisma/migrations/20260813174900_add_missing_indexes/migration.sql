-- CreateIndex
CREATE INDEX "Customer_shopId_orgName_idx" ON "Customer"("shopId", "orgName");

-- CreateIndex
CREATE INDEX "Customer_shopId_custType_idx" ON "Customer"("shopId", "custType");

-- CreateIndex
CREATE INDEX "Customer_shopId_employeeId_idx" ON "Customer"("shopId", "employeeId");

-- CreateIndex
CREATE INDEX "Customer_mobile_idx" ON "Customer" USING GIN ("mobile" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Customer_customerCode_idx" ON "Customer" USING GIN ("customerCode" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Product_shopId_departmentId_idx" ON "Product"("shopId", "departmentId");

-- CreateIndex
CREATE INDEX "Product_shopId_defaultSupplierId_idx" ON "Product"("shopId", "defaultSupplierId");

-- CreateIndex
CREATE INDEX "Product_externalCode_idx" ON "Product" USING GIN ("externalCode" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Sale_shopId_cashierId_idx" ON "Sale"("shopId", "cashierId");

-- CreateIndex
CREATE INDEX "Sale_invoiceNo_idx" ON "Sale" USING GIN ("invoiceNo" gin_trgm_ops);
