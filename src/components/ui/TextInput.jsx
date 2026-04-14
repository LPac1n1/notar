export default function TextInput({
  className = "",
  ...props
}) {
  return (
    <input
      className={`rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500 ${className}`.trim()}
      {...props}
    />
  );
}
