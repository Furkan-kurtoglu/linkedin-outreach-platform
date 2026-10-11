"use client";
import { useFormStatus } from "react-dom";

/** Form gönderilirken kendini kilitleyen düğme (çift tıklamayı önler). */
export function SubmitButton({ children, className = "btn primary", pendingText, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || rest.disabled} {...rest}>
      {pending ? (pendingText ?? "Kaydediliyor…") : children}
    </button>
  );
}
