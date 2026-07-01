import type { Metadata } from "next";
import {
  ThemeProvider,
  themeBootScript,
} from "@/components/theme/theme-provider";
import { COOPERATIVE_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: COOPERATIVE_NAME,
    template: `%s | ${COOPERATIVE_NAME}`,
  },
  description: COOPERATIVE_NAME,
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
