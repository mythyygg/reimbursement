"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getAccessToken } from "../lib/auth";

export default function AuthGuard({ children }: { children: ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const [authorized, setAuthorized] = useState(false);

    useEffect(() => {
        const token = getAccessToken();
        if (!token) {
            setAuthorized(false);
            router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        } else {
            setAuthorized(true);
        }
    }, [router, pathname]);

    if (!authorized) {
        // Return null or a skeleton to prevent flickering of protected content
        return (
            <div className="flex min-h-screen items-center justify-center bg-surface-1">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
        );
    }

    return <>{children}</>;
}
