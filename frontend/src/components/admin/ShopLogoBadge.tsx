"use client";

// Shop logo placeholder: when a shop has no uploaded logo, its name is shown
// in a white badge instead of a default image. Used by the shop header and the
// super admin's enroll/edit previews so they always match.
export function ShopLogoBadge({
  name,
  logoUrl,
  className = "",
}: {
  name: string;
  logoUrl: string | null;
  className?: string;
}) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logoUrl} alt={name} className={`h-9 w-9 rounded object-cover bg-white ${className}`} />;
  }

  return (
    <div
      className={`bg-white text-emerald-800 px-3 py-1 rounded shadow-sm border border-emerald-300 flex items-center justify-center ${className}`}
    >
      <span className="text-sm font-black tracking-tight uppercase truncate max-w-[12rem] whitespace-nowrap">
        {name || "Pharmacy"}
      </span>
    </div>
  );
}
