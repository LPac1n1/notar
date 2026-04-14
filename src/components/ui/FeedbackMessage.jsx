const TONE_STYLES = {
  error: "text-red-600",
  success: "text-emerald-700",
  info: "text-zinc-600",
};

export default function FeedbackMessage({
  message,
  tone = "info",
  className = "",
}) {
  if (!message) {
    return null;
  }

  return (
    <p className={`mb-4 ${TONE_STYLES[tone] || TONE_STYLES.info} ${className}`.trim()}>
      {message}
    </p>
  );
}
