import AuthGuard from "../../components/AuthGuard";
import type { ReactNode } from "react";

export default function InboxLayout({ children }: { children: ReactNode }) {
    return <AuthGuard>{children}</AuthGuard>;
}
