import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f8fafc] px-4">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#ADEBB3] shadow-lg mb-6">
          <span className="text-3xl font-black text-slate-900">Rx</span>
        </div>

        <p className="text-7xl font-black text-slate-900 tracking-tight">404</p>
        <h1 className="mt-2 text-xl font-black text-slate-900">Page Not Found</h1>
        <p className="mt-2 text-sm font-semibold text-slate-500 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist, may have moved, or the URL was typed incorrectly.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/"
            className="px-6 py-2.5 rounded-lg bg-[#ADEBB3] hover:brightness-95 text-slate-900 font-black text-sm shadow-md active:scale-95 transition-all"
          >
            Go to Home
          </Link>
        </div>

        <p className="mt-10 text-xs font-bold text-slate-400 tracking-wide uppercase">MediBox Pharmacy ERP</p>
      </div>
    </div>
  );
}
