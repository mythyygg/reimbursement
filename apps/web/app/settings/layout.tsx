import AuthGuard from "../../components/AuthGuard";
import type { ReactNode } from "react";

export default function SettingsLayout({ children }: { children: ReactNode }) {
    return <AuthGuard>{children}</AuthGuard>;
}
