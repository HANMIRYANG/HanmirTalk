import { Topbar } from "@/components/shell/Topbar";
import { Tag } from "@/components/ui/Tag";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import {
  ClockIcon,
  FavoriteIcon,
  FolderIcon,
  LockIcon,
  MoreIcon,
  PinIcon,
  SearchIcon,
  UploadIcon,
  CheckIcon
} from "@/components/ui/icons";
import { fileService } from "@/services/file.service";
import { userService } from "@/services/user.service";
import { getServerToken } from "@/lib/server-auth";
import { cn } from "@/lib/classNames";
import styles from "./files.module.css";

const folderTone: Record<string, string> = {
  yellow: styles.folderYellow,
  blue: styles.folderBlue,
  orange: styles.folderOrange,
  purple: styles.folderPurple
};

const fileColor: Record<string, string> = {
  pdf: styles.icPdf,
  xls: styles.icXls,
  doc: styles.icDoc,
  ppt: styles.icPpt,
  img: styles.icImg,
  zip: styles.icZip
};

const fileTag: Record<string, string> = {
  pdf: "PDF", xls: "XLS", doc: "DOC", ppt: "PPT", img: "IMG", zip: "ZIP"
};

export default async function FileLibraryPage() {
  const token = getServerToken();
  const [folders, files, users] = await Promise.all([
    fileService.listFolders({ token }),
    fileService.listFiles({ token }),
    userService.listUsers({ token })
  ]);
  const userById = new Map(users.map((u) => [u.id, u] as const));

  return (
    <div className={styles.layout}>
      <aside className={styles.scope}>
        <div className={styles.scopeTitle}>위치</div>
        <div className={cn(styles.scopeItem, styles.scopeActive)}>
          <FolderIcon size={14} />
          전체 파일<span className={styles.count}>842</span>
        </div>
        <div className={styles.scopeItem}>
          <ClockIcon size={14} />
          최근 항목<span className={styles.count}>28</span>
        </div>
        <div className={styles.scopeItem}>
          <PinIcon size={14} />
          즐겨찾기<span className={styles.count}>12</span>
        </div>
        <div className={styles.scopeItem}>
          <CheckIcon size={14} />
          내가 공유한 항목<span className={styles.count}>36</span>
        </div>
        <div className={styles.scopeItem}>
          <LockIcon size={14} />
          개인 보관함<span className={styles.count}>14</span>
        </div>

        <div className={styles.scopeTitle} style={{ marginTop: 14 }}>
          프로젝트
        </div>
        <div className={styles.scopeItem}>
          <span className={styles.scopeSw} style={{ background: "#1F4FA8" }} />
          P-2410 강판 자동화<span className={styles.count}>42</span>
        </div>
        <div className={styles.scopeItem}>
          <span className={styles.scopeSw} style={{ background: "#16A34A" }} />
          P-2411 신소재 SPC<span className={styles.count}>18</span>
        </div>
        <div className={styles.scopeItem}>
          <span className={styles.scopeSw} style={{ background: "#6D45B8" }} />
          P-2403 노후 설비 교체<span className={styles.count}>73</span>
        </div>

        <div className={styles.scopeTitle} style={{ marginTop: 14 }}>
          부서
        </div>
        <div className={styles.scopeItem}>
          생산기술팀<span className={styles.count}>228</span>
        </div>
        <div className={styles.scopeItem}>
          품질보증팀<span className={styles.count}>186</span>
        </div>
        <div className={styles.scopeItem}>
          영업본부<span className={styles.count}>142</span>
        </div>
        <div className={styles.scopeItem}>
          인사팀<span className={styles.count}>94</span>
        </div>
        <div className={styles.scopeItem}>
          자재팀<span className={styles.count}>73</span>
        </div>

        <div className={styles.scopeTitle} style={{ marginTop: 14 }}>
          유형
        </div>
        <div className={styles.scopeItem}>
          📄 문서 (Word/PDF)<span className={styles.count}>312</span>
        </div>
        <div className={styles.scopeItem}>
          📊 스프레드시트<span className={styles.count}>198</span>
        </div>
        <div className={styles.scopeItem}>
          🖼 이미지<span className={styles.count}>214</span>
        </div>
        <div className={styles.scopeItem}>
          📦 압축파일<span className={styles.count}>42</span>
        </div>
      </aside>

      <main className={styles.main}>
        <Topbar title="파일함" sub="전체 파일 · 842개" />

        <section className={styles.bar}>
          <div className={styles.crumb}>
            <a href="#">파일함</a>
            <span className={styles.sep}>›</span>
            <b>전체 파일</b>
          </div>
          <div className={styles.barRow}>
            <div className={styles.seg}>
              <button className={cn(styles.segBtn, styles.segActive)} type="button">
                목록
              </button>
              <button className={styles.segBtn} type="button">
                카드
              </button>
              <button className={styles.segBtn} type="button">
                상세
              </button>
            </div>
            <button className={styles.filterBtn} type="button">
              유형: <b>전체</b>
            </button>
            <button className={styles.filterBtn} type="button">
              소유자: <b>전체</b>
            </button>
            <button className={styles.filterBtn} type="button">
              기간: <b>최근 30일</b>
            </button>
            <button className={styles.filterBtn} type="button">
              정렬: <b>최신순</b>
            </button>
            <div className={styles.barRight}>
              <div className="search" style={{ width: 200 }}>
                <SearchIcon size={14} />
                <input placeholder="파일 검색" />
              </div>
              <button className="btn btn--outline btn--sm" type="button">
                새 폴더
              </button>
              <button className="btn btn--primary btn--sm" type="button">
                <UploadIcon size={12} />
                업로드
              </button>
            </div>
          </div>
        </section>

        <div className={styles.fcontent}>
          <div className={styles.sectionH}>📂 폴더 {folders.length}개</div>
          <div className={styles.folderGrid}>
            {folders.map((f) => (
              <div key={f.id} className={styles.folder}>
                <div className={styles.folderHead}>
                  <div className={cn(styles.folderIc, folderTone[f.tone])} />
                  <div className={styles.folderMenu}>⋯</div>
                </div>
                <div>
                  <div className={styles.folderName}>{f.name}</div>
                  <div className={styles.folderMeta}>{f.meta}</div>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.sectionH}>📄 파일 {files.length}개 (최근 업로드 순)</div>
          <div className={styles.ftable}>
            <table>
              <thead>
                <tr>
                  <th className={styles.colIc} />
                  <th>이름</th>
                  <th className={styles.colTag}>분류</th>
                  <th className={styles.colSz}>크기</th>
                  <th className={styles.colBy}>업로드</th>
                  <th className={styles.colDt}>날짜</th>
                  <th className={styles.colAct} />
                </tr>
              </thead>
              <tbody>
                {files.map((f) => {
                  const uploader = userById.get(f.uploaderId);
                  return (
                    <tr key={f.id}>
                      <td>
                        <div className={cn(styles.fic, fileColor[f.kind])}>{fileTag[f.kind]}</div>
                      </td>
                      <td>
                        <div className={styles.fname}>
                          {f.name}
                          {f.starred ? <FavoriteIcon size={12} /> : null}
                        </div>
                      </td>
                      <td>
                        <Tag tone={(f.scopeTone as "blue") ?? "default"}>{f.scope}</Tag>
                        {f.scopeExtra ? (
                          <Tag tone={(f.scopeExtra.tone as "amber") ?? "default"}>
                            {f.scopeExtra.label}
                          </Tag>
                        ) : null}
                      </td>
                      <td className="muted">{f.size}</td>
                      <td>
                        {uploader ? (
                          <div className={styles.byRow}>
                            <Avatar
                              initials={uploader.initials}
                              tone={uploader.avatarTone ?? "default"}
                              className={styles.byAvatar}
                            />
                            <span>
                              {uploader.name} {uploader.position}
                            </span>
                          </div>
                        ) : null}
                      </td>
                      <td className="muted">{f.uploadedAt}</td>
                      <td className={styles.rowAct}>
                        <IconButton aria-label="더보기">
                          <MoreIcon size={16} />
                        </IconButton>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
