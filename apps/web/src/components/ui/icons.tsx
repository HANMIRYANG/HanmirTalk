import type { SVGProps } from "react";

type Props = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...rest }: Props) {
  return { width: size, height: size, viewBox: "0 0 20 20", fill: "none", ...rest };
}

export const PlusIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M10 4v12M4 10h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export const SearchIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M13 13l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const PinIcon = (p: Props) => (
  <svg {...base(p)}>
    <path
      d="M11 3l6 6-4 1-3 7-1-5-5-1 7-3 1-5z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export const UsersIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="7" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="13.5" cy="8.5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M2 16c.5-2 2.5-3.2 5-3.2s4.5 1.2 5 3.2M12 16c.5-1.6 2-2.5 4-2.5s3.5.9 4 2.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const MoreIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="10" cy="5" r="1.5" fill="currentColor" />
    <circle cx="10" cy="10" r="1.5" fill="currentColor" />
    <circle cx="10" cy="15" r="1.5" fill="currentColor" />
  </svg>
);

export const CloseIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export const ChevronDownIcon = (p: Props) => (
  <svg {...base({ ...p, viewBox: "0 0 12 12" })}>
    <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
  </svg>
);

export const PaperclipIcon = (p: Props) => (
  <svg {...base(p)}>
    <path
      d="M14 7l-5.5 5.5a2.12 2.12 0 1 0 3 3L17 10a4.24 4.24 0 1 0-6-6L5 10"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const MentionIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M13 10v1.5a2 2 0 0 0 4 0V10a7 7 0 1 0-2.5 5.4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const EmojiIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M7 12c.7 1 1.7 1.5 3 1.5s2.3-.5 3-1.5M8 8h.01M12 8h.01"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </svg>
);

export const TaskIcon = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="13" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const BoldIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M6 4h5a3 3 0 0 1 0 6H6V4ZM6 10h6a3 3 0 0 1 0 6H6v-6Z" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const ItalicIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M9 4h7M4 16h7M12 4l-4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const ListIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M7 6h10M7 10h10M7 14h10M4 6h.01M4 10h.01M4 14h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const DownloadIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M10 3v10M5 9l5 5 5-5M4 17h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const FolderIcon = (p: Props) => (
  <svg {...base(p)}>
    <path
      d="M4 4.5A1.5 1.5 0 0 1 5.5 3h4l2 2h3A1.5 1.5 0 0 1 16 6.5v9A1.5 1.5 0 0 1 14.5 17h-9A1.5 1.5 0 0 1 4 15.5v-11Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
  </svg>
);

export const ClockIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="10" cy="10" r="6.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M10 6v4l3 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const CheckIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const LockIcon = (p: Props) => (
  <svg {...base(p)}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M7 9V6.5a3 3 0 0 1 6 0V9" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const UserIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="10" cy="7.5" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M4 16c.8-2.8 3.2-4.5 6-4.5s5.2 1.7 6 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const UploadIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M10 4v12M5 9l5-5 5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const MuteIcon = (p: Props) => (
  <svg {...base(p)}>
    <path
      d="M4 8v4h3l4 3V5L7 8H4ZM14 7l3 3M17 7l-3 3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const HomeIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 9l7-6 7 6v8a1 1 0 0 1-1 1h-4v-6H8v6H4a1 1 0 0 1-1-1V9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export const ChatIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8l-4 3v-3H5a2 2 0 0 1-2-2V5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export const ProjectIcon = (p: Props) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="11" y="3" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="3" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
    <rect x="11" y="11" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const ProductIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 7l7-3 7 3v6l-7 3-7-3V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M3 7l7 3 7-3M10 10v6" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const ErpIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M4 3h9l3 3v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M12 3v4h4M6 11h8M6 14h8M6 8h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const FileIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M5 3h7l4 4v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M12 3v4h4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export const NoticeIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M4 8l11-4v12L4 12V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M4 8H3a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h1" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

export const AdminIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="10" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M3.5 17c.5-3 3.5-4.5 6.5-4.5s6 1.5 6.5 4.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const SettingsIcon = (p: Props) => (
  <svg {...base(p)}>
    <circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M10 3v2M10 15v2M3 10h2M15 10h2M5 5l1.5 1.5M13.5 13.5L15 15M5 15l1.5-1.5M13.5 6.5L15 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

export const LogoutIcon = (p: Props) => (
  <svg {...base(p)}>
    <path
      d="M8 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M12 6l4 4-4 4M16 10H8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const BellIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M5 8a5 5 0 0 1 10 0v3l1.5 3h-13l1.5-3V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M8.5 16a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const FavoriteIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M10 3.5l1.9 4 4.4.6-3.2 3.1.8 4.3L10 13.5l-3.9 2 .8-4.3L3.7 8.1l4.4-.6 1.9-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export const InboxIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 12V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v7M3 12l2-1h3l1 2h2l1-2h3l2 1M3 12v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export const SendIcon = (p: Props) => (
  <svg {...base(p)}>
    <path d="M3 10l14-6-6 14-2-6-6-2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);
