/** Three rising wisps. Purely decorative. */
export default function Steam({ className = "" }) {
  return (
    <span className={`steam ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
