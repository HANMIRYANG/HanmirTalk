import { Topbar } from "@/components/shell/Topbar";
import { productService } from "@/services/product.service";
import { userService } from "@/services/user.service";
import { requireServerMe } from "@/lib/server-auth";
import { ProductsBrowser } from "./ProductsBrowser";

const WRITER_ROLES = new Set(["admin", "super_admin", "manager", "project_owner"]);

export default async function ProductListPage() {
  const { me, token } = await requireServerMe();
  const canManage = WRITER_ROLES.has(me.role);
  const [products, users] = await Promise.all([
    productService.listProducts({ token }),
    canManage ? userService.listUsers({ token }) : Promise.resolve([])
  ]);

  return (
    <>
      <Topbar title="제품정보" sub="제품별 영업 가능 상태와 자료를 확인하세요." />
      <div className="content">
        <ProductsBrowser products={products} users={users} canManage={canManage} />
      </div>
    </>
  );
}
