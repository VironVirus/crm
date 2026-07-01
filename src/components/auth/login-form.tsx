"use client";

import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, UserPlus } from "lucide-react";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COOPERATIVE_NAME } from "@/lib/brand";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { loginFormSchema } from "@/lib/validation/auth";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const parsed = loginFormSchema.safeParse({
      email,
      password,
    });

    if (!parsed.success) {
      setErrorMessage(
        parsed.error.issues[0]?.message ??
          "Please review your sign-in details and try again.",
      );
      return;
    }

    startTransition(() => {
      void (async () => {
        const supabase = createBrowserSupabaseClient();
        const { error } = await supabase.auth.signInWithPassword({
          email: parsed.data.email,
          password: parsed.data.password,
        });

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        router.replace(nextPath);
        router.refresh();
      })();
    });
  };

  return (
    <Card className="bg-card/90 shadow-[0_30px_80px_rgba(2,6,23,0.12)] backdrop-blur dark:shadow-[0_30px_80px_rgba(2,6,23,0.55)]">
      <CardHeader className="items-center space-y-4 text-center">
        <BrandMark priority size="lg" variant="full" />
        <CardTitle className="font-['Outfit'] text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          Welcome to {COOPERATIVE_NAME}, please login.
        </CardTitle>
        <div className="inline-flex w-fit rounded-full border border-border bg-secondary p-1 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <button
            className="rounded-full bg-emerald-500/15 px-4 py-2 text-emerald-700 transition dark:text-emerald-200"
            type="button"
          >
            <span className="inline-flex items-center gap-2">
              <LogIn size={14} />
              Sign in
            </span>
          </button>
          <Button asChild className="rounded-full px-4 py-2" variant="secondary">
            <Link href="/register">
              <span className="inline-flex items-center gap-2">
                <UserPlus size={14} />
                Register
              </span>
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="Email address"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {errorMessage ? (
            <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
              {errorMessage}
            </div>
          ) : null}

          <Button className="w-full" disabled={isPending} type="submit">
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="mr-2 h-4 w-4" />
                Continue
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
