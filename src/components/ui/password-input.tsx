"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PasswordInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<typeof Input>
>(({ className, ...props }, ref) => {
  const [isVisible, setIsVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        ref={ref}
        className={cn("pr-16", className)}
        type={isVisible ? "text" : "password"}
        {...props}
      />
      <button
        aria-label={isVisible ? "Hide password" : "Show password"}
        aria-pressed={isVisible}
        className="absolute inset-y-0 right-3 my-2 inline-flex items-center rounded-full px-2 text-xs font-medium text-muted-foreground transition hover:text-foreground focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
        onClick={() => setIsVisible((current) => !current)}
        type="button"
      >
        {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        <span className="ml-1 hidden sm:inline">{isVisible ? "Hide" : "Show"}</span>
      </button>
    </div>
  );
});

PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
