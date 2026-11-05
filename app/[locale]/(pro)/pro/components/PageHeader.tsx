/** Title and subtitle at the top of each workspace page. */
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-[32px] leading-tight font-extrabold tracking-[-0.02em]">{title}</h1>
      <p className="text-[15px] text-muted">{subtitle}</p>
    </header>
  );
}
