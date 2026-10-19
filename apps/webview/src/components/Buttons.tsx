import type { ButtonHTMLAttributes, ReactNode } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  block?: boolean;
};

export function PrimaryButton({ children, block, className, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn btn-primary ${block ? "btn-block" : ""} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, block, className, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn btn-secondary ${block ? "btn-block" : ""} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, block, className, ...rest }: BtnProps) {
  return (
    <button
      type="button"
      className={`btn btn-ghost ${block ? "btn-block" : ""} ${className ?? ""}`}
      {...rest}
    >
      {children}
    </button>
  );
}
