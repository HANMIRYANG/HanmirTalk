import { Topbar } from "@/components/shell/Topbar";
import { productService } from "@/services/product.service";
import { requireServerMe } from "@/lib/server-auth";
import { ProductCreateButton } from "./ProductCreateButton";
import { ProductsPagedGrid } from "./ProductsPagedGrid";
import styles from "./products.module.css";

const WRITER_ROLES = new Set(["admin", "super_admin", "manager", "project_owner"]);

export default async function ProductListPage() {
  const { me, token } = await requireServerMe();
  const products = await productService.listProducts({ token });
  const canManage = WRITER_ROLES.has(me.role);

  return (
    <>
      <Topbar title="제품정보" sub="제품별 영업 가능 상태와 자료를 확인하세요." />
      <div className="content">
        <div className={styles.toolbar}>
          <div className={styles.toolbarMeta}>{products.length}개 제품</div>
          {canManage ? <ProductCreateButton /> : null}
        </div>
        <ProductsPagedGrid products={products} />
      </div>
    </>
  );
}
