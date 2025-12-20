"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAccessToken } from "../lib/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const token = getAccessToken();
    router.replace(token ? "/projects" : "/login");
  }, [router]);

  return null;
}
