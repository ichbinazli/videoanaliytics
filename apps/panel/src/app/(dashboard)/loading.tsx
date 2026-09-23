/** Sayfa geçişlerinde iskelet: boş ekran yerine yapının önizlemesi. */
export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div className="h-7 w-40 animate-pulse rounded-lg bg-chip" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="h-24 animate-pulse rounded-2xl bg-chip" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-chip" />
    </div>
  );
}
