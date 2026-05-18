"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "@/lib/socket";

// Subscribes to the global `notice:new` event so any page in the app shell
// reflects fresh notices without manual reload. Mount once near the top of
// the authenticated layout.
export function NoticeLive() {
  const router = useRouter();

  useEffect(() => {
    const socket = getSocket();
    const onNotice = () => router.refresh();
    socket.on("notice:new", onNotice);
    return () => {
      socket.off("notice:new", onNotice);
    };
  }, [router]);

  return null;
}
