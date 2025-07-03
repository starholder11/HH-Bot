import { TinaProvider } from "tinacms/dist/admin";
import "tinacms/dist/admin.css";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <TinaProvider
      branch={process.env.HEAD || process.env.VERCEL_GIT_COMMIT_REF || "main"}
      clientId={process.env.NEXT_PUBLIC_TINA_CLIENT_ID || ""}
      isLocalClient={!process.env.NEXT_PUBLIC_TINA_CLIENT_ID}
    >
      {children}
    </TinaProvider>
  );
} 