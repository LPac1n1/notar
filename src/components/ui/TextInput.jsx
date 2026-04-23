export default function TextInput({
  className = "",
  ...props
}) {
  return (
    <input
      className={`w-full rounded-md border border-slate-700/80 bg-slate-900/70 px-4 py-3 text-slate-100 outline-none transition-colors duration-150 placeholder:text-slate-500 focus:border-slate-400 focus:bg-slate-900 ${className}`.trim()}
      {...props}
    />
  );
}
