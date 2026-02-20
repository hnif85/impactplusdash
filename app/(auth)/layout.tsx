import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impact Plus | Auth",
  description: "Authenticate to Impact Plus Dashboard",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-zinc-950 to-zinc-800 text-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-12">
        <div className="grid w-full gap-8 rounded-3xl bg-white/5 p-8 shadow-2xl ring-1 ring-white/10 backdrop-blur-lg md:grid-cols-[1fr_1.2fr] md:p-12">
          <div className="hidden flex-col justify-between md:flex">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-zinc-200">
                Impact Plus
              </p>
              <h1 className="mt-4 text-3xl font-semibold text-zinc-50">
                Monitoring penggunaan aplikasi
              </h1>
              
            </div>
           
          </div>
          <div className="flex flex-col">{children}</div>
        </div>
      </div>
    </div>
  );
}
