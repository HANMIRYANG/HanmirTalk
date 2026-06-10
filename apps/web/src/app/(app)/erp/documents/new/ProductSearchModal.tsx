"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import styles from "../../erp.module.css";

export interface ProductPick {
  id: string;
  name: string;
  code: string;
}

interface Props {
  open: boolean;
  products: ProductPick[];
  onClose: () => void;
  onPick: (product: ProductPick) => void;
}

// 판매입력 라인의 '품목'을 검색해 선택하는 모달. 제품명/품목코드로 필터.
export function ProductSearchModal({ open, products, onClose, onPick }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) || p.code.toLowerCase().includes(term)
    );
  }, [q, products]);

  return (
    <Modal open={open} onClose={onClose} title="품목 검색" description="제품명 또는 품목코드로 검색하세요." width={560}>
      <div className={styles.searchBox}>
        <input
          autoFocus
          className={styles.searchInput}
          placeholder="제품명 / 품목코드 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className={styles.searchResults}>
        {filtered.length === 0 ? (
          <div className={styles.searchEmpty}>검색 결과가 없습니다.</div>
        ) : (
          <table className={styles.lineTable}>
            <thead>
              <tr>
                <th style={{ width: 120 }}>품목코드</th>
                <th>품목명</th>
                <th style={{ width: 64 }} />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id}>
                  <td className={styles.mono}>{p.code || "-"}</td>
                  <td>{p.name}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn--primary btn--sm"
                      onClick={() => {
                        onPick(p);
                        onClose();
                      }}
                    >
                      선택
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
