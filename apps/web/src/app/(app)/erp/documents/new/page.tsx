import { Topbar } from "@/components/shell/Topbar";
import { erpService } from "@/services/erp.service";
import { productService } from "@/services/product.service";
import { requireServerMe } from "@/lib/server-auth";
import { SalesInputForm } from "./SalesInputForm";

export default async function NewErpDocumentPage() {
  const { me, token } = await requireServerMe();
  const [products, variants, warehouses] = await Promise.all([
    productService.listProducts({ token }).catch(() => []),
    erpService.listVariants({ token }).catch(() => []),
    erpService.listWarehouses({ token }).catch(() => [])
  ]);

  const isAdmin = me.role === "admin" || me.role === "super_admin";

  return (
    <>
      <Topbar title="판매입력" sub="전표를 저장하면 재고가 즉시 차감됩니다." />
      <div className="content">
        <SalesInputForm
          products={products.map((p) => ({
            id: p.id,
            name: p.fullName || p.name,
            code: p.code ?? ""
          }))}
          variants={variants.map((v) => ({
            id: v.id,
            productId: v.productId,
            specName: v.name,
            unitLabel: v.unitLabel
          }))}
          warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }))}
          managerId={me.id}
          managerName={me.name}
          isAdmin={isAdmin}
        />
      </div>
    </>
  );
}
