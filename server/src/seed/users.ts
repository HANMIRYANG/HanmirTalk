import type { User } from "@hanmir/shared";

export const seedUsers: User[] = [
  {
    id: "u-park-jiyoung",
    name: "박지영",
    email: "park.jiyoung@hanmir.co.kr",
    departmentId: "d-prod-eng",
    departmentName: "생산기술팀",
    position: "책임",
    role: "project_owner",
    avatarTone: "orange",
    initials: "박지",
    presence: "online"
  },
  {
    id: "u-kim-minjun",
    name: "김민준",
    email: "kim.minjun@hanmir.co.kr",
    departmentId: "d-prod-eng",
    departmentName: "생산기술팀",
    position: "책임",
    role: "manager",
    avatarTone: "default",
    initials: "김민",
    presence: "online"
  },
  {
    id: "u-yoon-seoyeon",
    name: "윤서연",
    email: "yoon.seoyeon@hanmir.co.kr",
    departmentId: "d-prod-eng",
    departmentName: "생산기술팀",
    position: "책임",
    role: "member",
    avatarTone: "green",
    initials: "윤",
    presence: "online"
  },
  {
    id: "u-lee-suhyun",
    name: "이수현",
    email: "lee.suhyun@hanmir.co.kr",
    departmentId: "d-quality",
    departmentName: "품질보증팀",
    position: "수석",
    role: "manager",
    avatarTone: "purple",
    initials: "이수",
    presence: "online"
  },
  {
    id: "u-han-jisu",
    name: "한지수",
    email: "han.jisu@hanmir.co.kr",
    departmentId: "d-quality",
    departmentName: "품질보증팀",
    position: "사원",
    role: "member",
    avatarTone: "default",
    initials: "한지",
    presence: "online"
  },
  {
    id: "u-choi-dohyun",
    name: "최도현",
    email: "choi.dohyun@hanmir.co.kr",
    departmentId: "d-sales",
    departmentName: "영업본부 1팀",
    position: "책임",
    role: "manager",
    avatarTone: "orange",
    initials: "최도",
    presence: "online"
  },
  {
    id: "u-kang-eunhye",
    name: "강은혜",
    email: "kang.eunhye@hanmir.co.kr",
    departmentId: "d-hr",
    departmentName: "인사팀",
    position: "수석",
    role: "admin",
    avatarTone: "gray",
    initials: "강은",
    presence: "off"
  },
  {
    id: "u-jung-minho",
    name: "정민호",
    email: "jung.minho@hanmir.co.kr",
    departmentId: "d-prod-eng",
    departmentName: "생산기술팀",
    position: "팀장",
    role: "super_admin",
    avatarTone: "gray",
    initials: "정민",
    presence: "online"
  }
];

export const defaultUserId = "u-kim-minjun";
