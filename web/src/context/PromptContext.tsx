import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { Modal, Input, Button } from "../components/ui";

// A promise-based text/password prompt so pages can `await prompt({...})`
// instead of calling window.prompt(). Renders the app's own Modal, so it looks
// like the rest of the app rather than a browser popup. Resolves the entered
// value, or null if cancelled.

export interface PromptOptions {
  title: string;
  message?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  type?: "text" | "password";
  required?: boolean;
  minLength?: number;
}

type PromptFn = (opts: PromptOptions) => Promise<string | null>;

const PromptContext = createContext<PromptFn | null>(null);

interface Pending extends PromptOptions {
  resolve: (value: string | null) => void;
}

export function PromptProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [value, setValue] = useState("");

  // Reset the field each time a new prompt opens.
  useEffect(() => { setValue(pending?.defaultValue ?? ""); }, [pending]);

  const prompt = useCallback<PromptFn>(
    (opts) => new Promise<string | null>((resolve) => setPending({ ...opts, resolve })),
    []
  );

  const cancel = () => setPending((p) => { p?.resolve(null); return null; });
  const submit = () => setPending((p) => { p?.resolve(value); return null; });

  const tooShort = !!pending?.minLength && value.trim().length < pending.minLength;
  const empty = !!pending?.required && !value.trim();
  const disabled = empty || tooShort;

  return (
    <PromptContext.Provider value={prompt}>
      {children}
      <Modal open={!!pending} onClose={cancel} title={pending?.title ?? ""}>
        <form
          onSubmit={(e) => { e.preventDefault(); if (!disabled) submit(); }}
          className="space-y-3"
        >
          {pending?.message && <p className="text-sm text-slate-600">{pending.message}</p>}
          <Input
            label={pending?.label}
            type={pending?.type ?? "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={pending?.placeholder}
            minLength={pending?.minLength}
            autoFocus
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={cancel}>Cancel</Button>
            <Button type="submit" disabled={disabled}>{pending?.confirmLabel ?? "OK"}</Button>
          </div>
        </form>
      </Modal>
    </PromptContext.Provider>
  );
}

export function usePrompt(): PromptFn {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error("usePrompt must be used within PromptProvider");
  return ctx;
}
