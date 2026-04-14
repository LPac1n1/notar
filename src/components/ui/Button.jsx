const VARIANTS = {
  primary: "bg-blue-600 text-white",
  danger: "bg-red-600 text-white",
  subtle: "bg-zinc-100 text-zinc-900",
};

export default function Button({
  variant = "primary",
  type = "button",
  className = "",
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={`rounded-lg px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant] || VARIANTS.primary} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
