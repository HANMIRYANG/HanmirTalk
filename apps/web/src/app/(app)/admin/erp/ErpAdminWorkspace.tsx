"use client";

import { useState } from "react";
import { erpService } from "@/services/erp.service";
import { apiBaseUrl } from "@/services/api-client";
import type { ProductVariant, Warehouse, MesProductMapping } from "@hanmir/shared";
import erp from "../../erp/erp.module.css";
import styles from "./erp-admin.module.css";

interface ProductOption {
  id: string;
  name: string;
}
interface Props {
  products: ProductOption[];
  initialVariants: ProductVariant[];
  initialWarehouses: Warehouse[];
  initialMappings: MesProductMapping[];
}

export function ErpAdminWorkspace({
  products,
  initialVariants,
  initialWarehouses,
  initialMappings
}: Props) {
  const [variants, setVariants] = useState(initialVariants);
  const [warehouses, setWarehouses] = useState(initialWarehouses);
  const [mappings, setMappings] = useState(initialMappings);
  const [msg, setMsg] = useState<string | null>(null);

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? id;

  // ── 창고 ──
  const [whCode, setWhCode] = useState("");
  const [whName, setWhName] = useState("");
  const addWarehouse = async () => {
    if (!whCode.trim() || !whName.trim()) return;
    try {
      const w = await erpService.createWarehouse({ code: whCode.trim(), name: whName.trim() });
      setWarehouses((p) => [...p, w]);
      setWhCode("");
      setWhName("");
    } catch {
      setMsg("창고 등록 실패 (코드 중복 가능)");
    }
  };

  // ── 규격 ──
  const [vProduct, setVProduct] = useState(products[0]?.id ?? "");
  const [vCode, setVCode] = useState("");
  const [vName, setVName] = useState("");
  const [vUnit, setVUnit] = useState("");
  const [vKg, setVKg] = useState("");
  const addVariant = async () => {
    if (!vProduct || !vCode.trim() || !vName.trim() || !vUnit.trim()) return;
    try {
      const v = await erpService.createVariant(vProduct, {
        code: vCode.trim(),
        name: vName.trim(),
        unitLabel: vUnit.trim(),
        kgPerUnit: Number(vKg) || 0
      });
      setVariants((p) => [...p, v]);
      setVCode("");
      setVName("");
      setVUnit("");
      setVKg("");
    } catch {
      setMsg("규격 등록 실패 (코드 중복 가능)");
    }
  };

  // ── 초기 재고 ──
  const [stkVariant, setStkVariant] = useState("");
  const [stkWarehouse, setStkWarehouse] = useState("");
  const [stkQty, setStkQty] = useState("");
  const applyStock = async () => {
    if (!stkVariant || !stkWarehouse || !(Number(stkQty) !== 0)) return;
    try {
      const r = await erpService.importInventory([
        {
          productVariantId: stkVariant,
          warehouseId: stkWarehouse,
          quantity: Number(stkQty),
          direction: "adjust"
        }
      ]);
      setMsg(`재고 ${r.applied}건 반영 완료`);
      setStkQty("");
    } catch {
      setMsg("초기 재고 반영 실패");
    }
  };

  // ── MES 매핑 ──
  const [mProduct, setMProduct] = useState(products[0]?.id ?? "");
  const [mesProductId, setMesProductId] = useState("");
  const [mesItemCode, setMesItemCode] = useState("");
  const addMapping = async () => {
    if (!mProduct) return;
    try {
      const m = await erpService.createMesMapping({
        productId: mProduct,
        mesProductId: mesProductId.trim() || undefined,
        mesItemCode: mesItemCode.trim() || undefined
      });
      setMappings((p) => [...p, m]);
      setMesProductId("");
      setMesItemCode("");
    } catch {
      setMsg("MES 매핑 등록 실패");
    }
  };

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>ERP 설정</h1>
          <p className={styles.sub}>판매/포장 규격, 창고, 초기 재고, MES 매핑을 관리합니다.</p>
        </div>
        <div className={styles.exports}>
          <a className="btn btn--ghost btn--sm" href={`${apiBaseUrl}/erp/exports/inventory`}>
            현재고 Excel
          </a>
          <a className="btn btn--ghost btn--sm" href={`${apiBaseUrl}/erp/exports/documents`}>
            전표 Excel
          </a>
        </div>
      </header>

      {msg ? <div className={styles.notice}>{msg}</div> : null}

      {/* 창고 */}
      <section className={styles.section}>
        <h2 className={styles.h2}>창고</h2>
        <div className={styles.inlineForm}>
          <input placeholder="코드 (예: 100)" value={whCode} onChange={(e) => setWhCode(e.target.value)} />
          <input placeholder="창고명 (예: 본사창고)" value={whName} onChange={(e) => setWhName(e.target.value)} />
          <button className="btn btn--primary btn--sm" onClick={addWarehouse}>추가</button>
        </div>
        <table className={erp.table}>
          <thead><tr><th>코드</th><th>이름</th><th>상태</th></tr></thead>
          <tbody>
            {warehouses.map((w) => (
              <tr key={w.id}>
                <td className={erp.mono}>{w.code}</td>
                <td>{w.name}</td>
                <td>{w.isActive ? "활성" : "비활성"}</td>
              </tr>
            ))}
            {warehouses.length === 0 ? <tr><td colSpan={3}>등록된 창고가 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </section>

      {/* 규격 */}
      <section className={styles.section}>
        <h2 className={styles.h2}>판매/포장 규격</h2>
        <div className={styles.inlineForm}>
          <select value={vProduct} onChange={(e) => setVProduct(e.target.value)}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input placeholder="규격코드" value={vCode} onChange={(e) => setVCode(e.target.value)} />
          <input placeholder="규격명 (예: 18kg)" value={vName} onChange={(e) => setVName(e.target.value)} />
          <input placeholder="단위 (예: 말통)" value={vUnit} onChange={(e) => setVUnit(e.target.value)} />
          <input placeholder="kg/단위" inputMode="decimal" value={vKg} onChange={(e) => setVKg(e.target.value)} />
          <button className="btn btn--primary btn--sm" onClick={addVariant}>추가</button>
        </div>
        <table className={erp.table}>
          <thead><tr><th>제품</th><th>코드</th><th>규격</th><th>단위</th><th className={erp.right}>kg/단위</th></tr></thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id}>
                <td>{productName(v.productId)}</td>
                <td className={erp.mono}>{v.code}</td>
                <td>{v.name}</td>
                <td>{v.unitLabel}</td>
                <td className={erp.right}>{v.kgPerUnit}</td>
              </tr>
            ))}
            {variants.length === 0 ? <tr><td colSpan={5}>등록된 규격이 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </section>

      {/* 초기 재고 */}
      <section className={styles.section}>
        <h2 className={styles.h2}>초기 재고 / 조정</h2>
        <div className={styles.inlineForm}>
          <select value={stkVariant} onChange={(e) => setStkVariant(e.target.value)}>
            <option value="">규격 선택</option>
            {variants.map((v) => (
              <option key={v.id} value={v.id}>{productName(v.productId)} / {v.name}</option>
            ))}
          </select>
          <select value={stkWarehouse} onChange={(e) => setStkWarehouse(e.target.value)}>
            <option value="">창고 선택</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}
          </select>
          <input placeholder="수량 (+/-)" inputMode="decimal" value={stkQty} onChange={(e) => setStkQty(e.target.value)} />
          <button className="btn btn--primary btn--sm" onClick={applyStock}>반영</button>
        </div>
        <p className={styles.hint}>음수를 입력하면 감산 조정됩니다. 대량 등록(CSV)은 후속 추가 예정.</p>
      </section>

      {/* MES 매핑 */}
      <section className={styles.section}>
        <h2 className={styles.h2}>MES 제품 매핑</h2>
        <div className={styles.inlineForm}>
          <select value={mProduct} onChange={(e) => setMProduct(e.target.value)}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input placeholder="MES 제품 ID" value={mesProductId} onChange={(e) => setMesProductId(e.target.value)} />
          <input placeholder="MES 품목코드" value={mesItemCode} onChange={(e) => setMesItemCode(e.target.value)} />
          <button className="btn btn--primary btn--sm" onClick={addMapping}>추가</button>
        </div>
        <table className={erp.table}>
          <thead><tr><th>제품</th><th>MES 제품 ID</th><th>MES 품목코드</th><th>상태</th></tr></thead>
          <tbody>
            {mappings.map((m) => (
              <tr key={m.id}>
                <td>{productName(m.productId)}</td>
                <td className={erp.mono}>{m.mesProductId ?? "-"}</td>
                <td className={erp.mono}>{m.mesItemCode ?? "-"}</td>
                <td>{m.isActive ? "활성" : "비활성"}</td>
              </tr>
            ))}
            {mappings.length === 0 ? <tr><td colSpan={4}>등록된 매핑이 없습니다.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
