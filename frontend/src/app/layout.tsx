import Footer from "@/components/Footer";
import Header from "@/components/Header";
import ScrollToTop from "@/components/ScrollToTop";
import { Providers } from "./providers";
import "../styles/index.css";

// Evaluated once during static export, then shared with the client footer.
const buildYear = new Date().getFullYear();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html suppressHydrationWarning lang="id">
      <body className="bg-[#FCFCFC]">
        <Providers>
          <div className="isolate">
            <Header />
            <main>{children}</main>
            <Footer year={buildYear} />
          </div>
          <ScrollToTop />
        </Providers>
      </body>
    </html>
  );
}
