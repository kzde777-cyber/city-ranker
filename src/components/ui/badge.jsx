export function Badge({ children, className = "" }) {
  return (
    <span className={`inline-block px-2 py-1 rounded-full bg-gray-200 text-sm ${className}`}>
      {children}
    </span>
  );
}
