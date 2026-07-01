import type { Metadata } from "next";
import {
  ThemeProvider,
  themeBootScript,
} from "@/components/theme/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ifemelunma Cooperative Society",
    template: "%s | Ifemelunma Cooperative Society",
  },
  description:
    "Cooperative society management system for administrators and members.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: themeBootScript }}
          suppressHydrationWarning
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
