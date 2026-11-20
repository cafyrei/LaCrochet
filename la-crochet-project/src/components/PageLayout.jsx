import { useLocation } from "react-router";

// The content area of a shop page (the Navbar, Footer and chat button come from
// ShopLayout). It fades in gently each time a new page opens.
// width: "narrow" for reading pages, "wide" for shopping pages.
export default function PageLayout({ children, width = "narrow" }) {
  const { pathname } = useLocation();

  return (
    <main
      id="main"
      tabIndex={-1}
      key={pathname}
      className={`page-enter mx-auto min-h-[60vh] px-4 pt-8 pb-8 outline-none sm:px-6 sm:pt-12 lg:px-8 ${
        width === "wide" ? "max-w-7xl" : "max-w-3xl"
      }`}
    >
      {children}
    </main>
  );
}
