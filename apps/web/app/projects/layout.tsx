import AuthGuard from "../../components/AuthGuard";
import type { ReactNode } from "react";

export default function ProjectsLayout({ children }: { children: ReactNode }) {
    return <AuthGuard>{children}</AuthGuard>;
}
