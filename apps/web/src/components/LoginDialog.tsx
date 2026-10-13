import { type FormEvent, useRef, useState } from "react";

export function LoginDialog({ onLogin }: { onLogin: (password: string) => Promise<boolean> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    setError(null);
    dialog.current?.showModal();
  };
  const close = () => {
    setPassword("");
    dialog.current?.close();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (await onLogin(password)) close();
    else setError("Reviewer login failed.");
  };

  return (
    <>
      <button type="button" className="button button-primary button-sm" onClick={open}>
        Reviewer login
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby="login-title" onClose={() => setPassword("")}>
        <form onSubmit={submit}>
          <h2 id="login-title">Reviewer login</h2>
          <p className="muted">Only an authenticated reviewer can approve a revision.</p>
          <label className="field-label" htmlFor="reviewer-password">
            Reviewer password
          </label>
          <input
            id="reviewer-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <div className="button-row">
            <button type="button" className="button" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={!password}>
              Log in
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
