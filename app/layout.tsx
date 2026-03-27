import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { UserProvider } from "@/components/user-provider";
import { ChatSettingsProvider } from "@/components/chat-settings-provider";
import { getUser } from "@/lib/user";
import "./globals.css";

export const metadata: Metadata = {
  title: "LLM Chat",
  description: "A simple streaming LLM chat UI",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getUser();

  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <UserProvider user={user}>
            <ChatSettingsProvider>
              {children}
            </ChatSettingsProvider>
          </UserProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
