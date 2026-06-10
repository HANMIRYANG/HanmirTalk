import { erpService } from "@/services/erp.service";
import { productService } from "@/services/product.service";
import { requireServerMe } from "@/lib/server-auth";
import { ErpAdminWorkspace } from "./ErpAdminWorkspace";

export default async function AdminErpPage() {
  const { token } = await requireServerMe();
  const [products, variants, warehouses, mappings] = await Promise.all([
    productService.listProducts({ token }).catch(() => []),
    erpService.listVariants({ token }).catch(() => []),
    erpService.listWarehouses({ token }).catch(() => []),
    erpService.listMesMappings({ token }).catch(() => [])
  ]);

  return (
    <ErpAdminWorkspace
      products={products.map((p) => ({ id: p.id, name: p.fullName || p.name }))}
      initialVariants={variants}
      initialWarehouses={warehouses}
      initialMappings={mappings}
    />
  );
}
