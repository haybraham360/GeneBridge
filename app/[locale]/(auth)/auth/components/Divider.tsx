export function Divider({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3 text-muted">
      <span aria-hidden="true" className="h-px flex-1 bg-[#EADBD0]" />
      <span className="text-[13px]">{children}</span>
      <span aria-hidden="true" className="h-px flex-1 bg-[#EADBD0]" />
    </div>
  );
}
