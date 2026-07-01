import { LoginForm } from "@/components/auth/login-form";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { internalRedirectPathSchema } from "@/lib/validation/auth";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: {
    next?: string;
  };
}) {
  const nextPath = internalRedirectPathSchema.safeParse(searchParams?.next);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.16),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(251,191,36,0.12),_transparent_30%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)))] px-4 py-8 text-foreground sm:px-6 sm:py-10">
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <LoginForm nextPath={nextPath.success ? nextPath.data : "/portal"} />
      </div>
    </main>
  );
}
