"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { erpService } from "@/services/erp.service";
import { ApiError } from "@/services/api-client";
import type { CreateErpDocumentInput } from "@hanmir/shared";
import styles from "../../erp.module.css";
import { ProductSearchModal, type ProductPick } from "./ProductSearchModal";

interface VariantOption {
  id: string;
  productId: string;
  specName: string;
  unitLabel: string;
}
interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}
interface Props {
  products: ProductPick[];
  variants: VariantOption[];
  warehouses: WarehouseOption[];
  managerId: string;
  managerName: string;
  isAdmin: boolean;
}

interface LineRow {
  key: string;
  productId: string;
  productName: string;
  productCode: string;
  variantId: string; // 선택한 품목의 규격
  quantity: string;
  unitPrice: string;
  vatAmount: string; // 비우면 공급가액 10% 자동
  note: string;
  serialLot: string;
}

let rowSeq = 0;
function emptyRow(): LineRow {
  rowSeq += 1;
  return {
    key: `row-${rowSeq}`,
    productId: "",
    productName: "",
    productCode: "",
    variantId: "",
    quantity: "",
    unitPrice: "",
    vatAmount: "",
    note: "",
    serialLot: ""
  };
}

function won(n: number): string {
  return n.toLocaleString("ko-KR");
}

const today = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
};

export function SalesInputForm({
  products,
  variants,
  warehouses,
  managerId,
  managerName,
  isAdmin
}: Props) {
  const router = useRouter();
  const [documentDate, setDocumentDate] = useState(today());
  const [customerName, setCustomerName] = useState("");
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? "");
  const [transactionType, setTransactionType] = useState("부가세율 적용");
  const [currency, setCurrency] = useState("KRW");
  const [contact, setContact] = useState("");
  const [address, setAddress] = useState("");
  const [rows, setRows] = useState<LineRow[]>([emptyRow(), emptyRow(), emptyRow()]);
  const [allowNegative, setAllowNegative] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // 품목 검색 모달이 열린 대상 행 key.
  const [searchRow, setSearchRow] = useState<string | null>(null);

  const variantById = useMemo(() => new Map(variants.map((v) => [v.id, v])), [variants]);
  // 품목별 규격 목록.
  const variantsByProduct = useMemo(() => {
    const map = new Map<string, VariantOption[]>();
    for (const v of variants) {
      const arr = map.get(v.productId) ?? [];
      arr.push(v);
      map.set(v.productId, arr);
    }
    return map;
  }, [variants]);

  const computed = rows.map((r) => {
    const qty = Number(r.quantity) || 0;
    const price = Number(r.unitPrice) || 0;
    const supply = Math.round(qty * price);
    const vat = r.vatAmount.trim() === "" ? Math.round(supply * 0.1) : Number(r.vatAmount) || 0;
    return { supply, vat, total: supply + vat };
  });
  const supplyTotal = computed.reduce((s, c) => s + c.supply, 0);
  const vatTotal = computed.reduce((s, c) => s + c.vat, 0);

  const updateRow = (key: string, patch: Partial<LineRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };
  const addRow = () => setRows((prev) => [...prev, emptyRow()]);
  const removeRow = (key: string) =>
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));

  // 품목 선택 시: 품목 정보 채우고 규격 초기화(품목이 바뀌면 기존 규격은 무효).
  const pickProduct = (rowKey: string, p: ProductPick) => {
    updateRow(rowKey, {
      productId: p.id,
      productName: p.name,
      productCode: p.code,
      variantId: ""
    });
  };

  const onSave = async () => {
    setError(null);
    const filled = rows.filter((r) => r.productId && r.variantId && Number(r.quantity) > 0);
    if (filled.length === 0) {
      setError("품목·규격·수량이 모두 입력된 라인이 최소 1개 필요합니다.");
      return;
    }
    const input: CreateErpDocumentInput = {
      documentType: "sale",
      documentDate,
      managerId,
      customerName: customerName.trim() || undefined,
      warehouseId: warehouseId || undefined,
      transactionType: transactionType.trim() || undefined,
      currency,
      contact: contact.trim() || undefined,
      address: address.trim() || undefined,
      allowNegative: isAdmin && allowNegative,
      lines: filled.map((r) => {
        const v = variantById.get(r.variantId);
        const qty = Number(r.quantity) || 0;
        const price = Number(r.unitPrice) || 0;
        return {
          productId: r.productId,
          productVariantId: r.variantId,
          warehouseId: warehouseId || undefined,
          itemCode: r.productCode || undefined,
          itemName: r.productName,
          specLabel: v?.specName,
          quantity: qty,
          unitPrice: price,
          vatAmount: r.vatAmount.trim() === "" ? undefined : Number(r.vatAmount) || 0,
          note: r.note.trim() || undefined,
          serialLot: r.serialLot.trim() || undefined
        };
      })
    };
    setSaving(true);
    try {
      const doc = await erpService.createDocument(input);
      router.push(`/erp/documents/${doc.id}`);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setError(
          isAdmin
            ? "재고가 부족합니다. 관리자 권한으로 '음수 재고 허용'을 체크하면 강제 저장할 수 있습니다."
            : "재고가 부족하여 저장할 수 없습니다. 관리자에게 문의하세요."
        );
      } else if (e instanceof ApiError) {
        setError(`저장 실패: ${e.message}`);
      } else {
        setError("저장 중 오류가 발생했습니다.");
      }
      setSaving(false);
    }
  };

  return (
    <div className={styles.form}>
      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.headerGrid}>
        <div className={styles.field}>
          <label>일자</label>
          <input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>거래처</label>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="거래처명" />
        </div>
        <div className={styles.field}>
          <label>담당자</label>
          <input value={managerName} disabled />
        </div>
        <div className={styles.field}>
          <label>출하창고</label>
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">창고 선택</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} · {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label>거래유형</label>
          <input value={transactionType} onChange={(e) => setTransactionType(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label>통화</label>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option value="KRW">내자 (KRW)</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>연락처</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="연락처" />
        </div>
        <div className={styles.field}>
          <label>주소</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="주소" />
        </div>
      </div>

      <table className={styles.lineTable}>
        <thead>
          <tr>
            <th style={{ width: 28 }}>#</th>
            <th style={{ width: 110 }}>품목코드</th>
            <th>품목명</th>
            <th style={{ width: 150 }}>규격</th>
            <th style={{ width: 90 }}>수량</th>
            <th style={{ width: 110 }}>단가</th>
            <th style={{ width: 110 }} className={styles.num}>공급가액</th>
            <th style={{ width: 110 }}>부가세</th>
            <th>적요</th>
            <th style={{ width: 120 }}>시리얼/로트</th>
            <th style={{ width: 28 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const specOptions = r.productId ? variantsByProduct.get(r.productId) ?? [] : [];
            return (
              <tr key={r.key}>
                <td>{i + 1}</td>
                <td className={styles.mono}>{r.productCode || "-"}</td>
                <td>
                  <button
                    type="button"
                    className={styles.pickBtn}
                    onClick={() => setSearchRow(r.key)}
                  >
                    {r.productName || "품목 검색…"}
                  </button>
                </td>
                <td>
                  <select
                    value={r.variantId}
                    disabled={!r.productId}
                    onChange={(e) => updateRow(r.key, { variantId: e.target.value })}
                  >
                    <option value="">
                      {r.productId
                        ? specOptions.length
                          ? "규격 선택"
                          : "등록된 규격 없음"
                        : "품목 먼저 선택"}
                    </option>
                    {specOptions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.specName} ({v.unitLabel})
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    className={styles.num}
                    inputMode="decimal"
                    value={r.quantity}
                    onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    className={styles.num}
                    inputMode="decimal"
                    value={r.unitPrice}
                    onChange={(e) => updateRow(r.key, { unitPrice: e.target.value })}
                  />
                </td>
                <td className={styles.num}>{won(computed[i].supply)}</td>
                <td>
                  <input
                    className={styles.num}
                    inputMode="decimal"
                    placeholder={String(Math.round((Number(r.quantity) || 0) * (Number(r.unitPrice) || 0) * 0.1))}
                    value={r.vatAmount}
                    onChange={(e) => updateRow(r.key, { vatAmount: e.target.value })}
                  />
                </td>
                <td>
                  <input value={r.note} onChange={(e) => updateRow(r.key, { note: e.target.value })} />
                </td>
                <td>
                  <input
                    value={r.serialLot}
                    onChange={(e) => updateRow(r.key, { serialLot: e.target.value })}
                  />
                </td>
                <td>
                  <button type="button" className={styles.removeBtn} onClick={() => removeRow(r.key)}>
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div>
        <button type="button" className="btn btn--ghost btn--sm" onClick={addRow}>
          + 행 추가
        </button>
      </div>

      <div className={styles.totals}>
        <div><span>공급가액</span>{won(supplyTotal)}</div>
        <div><span>부가세</span>{won(vatTotal)}</div>
        <div><span>합계</span>{won(supplyTotal + vatTotal)}</div>
      </div>

      <div className={styles.formActions}>
        {isAdmin ? (
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-3)", marginRight: "auto" }}>
            <input
              type="checkbox"
              checked={allowNegative}
              onChange={(e) => setAllowNegative(e.target.checked)}
            />
            음수 재고 허용(관리자)
          </label>
        ) : null}
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => router.push("/erp")}>
          취소
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      <ProductSearchModal
        open={searchRow !== null}
        products={products}
        onClose={() => setSearchRow(null)}
        onPick={(p) => {
          if (searchRow) pickProduct(searchRow, p);
        }}
      />
    </div>
  );
}
