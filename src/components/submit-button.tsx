"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
export function SubmitButton({
  children,
  disabled = false,
}: {
  children: React.ReactNode;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending}>
      {pending ? "処理中…" : children}
    </Button>
  );
}
