import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation } from 'react-router';

/**
 * Если на экране случилась ошибка, сайт не должен «пропадать» (ТЗ v4.29.1): вместо пустой страницы —
 * понятное сообщение, «Вернуться» / «Перезагрузить» и текст ошибки, который можно прислать разработчику.
 * Последняя ошибка сохраняется в браузере (kc-last-error).
 */
type Props = { children: ReactNode; onReset?: () => void; full?: boolean };

type State = { error: Error | null; copied: boolean };

/** Сайт обновили, а браузер держит старую версию: не найден кусок страницы. */
const isStaleChunk = (e: Error) =>
  /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(
    e.message,
  );

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Канбат: ошибка на экране', error, info.componentStack);
    try {
      localStorage.setItem(
        'kc-last-error',
        JSON.stringify({
          at: new Date().toISOString(),
          url: location.href,
          text: details(error, info),
        }),
      );
    } catch {
      /* без сохранения */
    }
  }

  /** «Назад»: на предыдущий экран (там ошибки нет), а если его нет — на главную. */
  back = () => {
    this.setState({ error: null, copied: false });
    this.props.onReset?.();
    if (history.length > 1) history.back();
    else location.assign('/');
  };

  render() {
    const { error, copied } = this.state;
    if (!error) return this.props.children;
    const stale = isStaleChunk(error);
    const text = details(error);
    return (
      <div
        role="alert"
        className={
          this.props.full
            ? 'flex min-h-dvh items-center justify-center bg-canvas p-4 text-fg'
            : 'flex min-h-[60dvh] items-center justify-center p-4 text-fg'
        }
      >
        <div className="flex w-full max-w-[520px] flex-col gap-3 rounded-panel border border-line bg-surface p-5 shadow-card">
          <h1 className="font-serif text-xl text-heading">
            {stale ? 'Канбат обновился' : 'Что-то пошло не так на этом экране'}
          </h1>
          <p className="text-sm">
            {stale
              ? 'Браузер держит старую версию страницы. Перезагрузите её — ничего не потеряется.'
              : 'Ваши обращения и настройки не пропали. Вернитесь назад или перезагрузите страницу. Если ошибка повторяется — скопируйте её текст и пришлите разработчику.'}
          </p>
          <div className="flex flex-wrap gap-2">
            {!stale && (
              <button
                type="button"
                onClick={this.back}
                className="min-h-11 rounded-control border border-line-strong px-4 text-sm text-fg hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                Назад
              </button>
            )}
            <button
              type="button"
              onClick={() => location.reload()}
              className="min-h-11 rounded-control bg-primary px-4 text-sm text-on-primary hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              Перезагрузить
            </button>
            {!stale && (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(text)
                    .then(() => this.setState({ copied: true }))
                    .catch(() => {});
                }}
                className="min-h-11 rounded-control px-4 text-sm text-fg underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                {copied ? 'Скопировано' : 'Скопировать текст ошибки'}
              </button>
            )}
          </div>
          {!stale && (
            <details className="text-xs text-fg-muted">
              <summary className="cursor-pointer py-1">Текст ошибки</summary>
              <pre className="mt-1 max-h-48 overflow-auto rounded-control bg-sunken p-2 whitespace-pre-wrap">
                {text}
              </pre>
            </details>
          )}
        </div>
      </div>
    );
  }
}

function details(error: Error, info?: ErrorInfo): string {
  const stack = (error.stack ?? '').split('\n').slice(0, 6).join('\n');
  const where = info?.componentStack?.split('\n').filter(Boolean).slice(0, 5).join('\n') ?? '';
  return [`${error.name}: ${error.message}`, `Адрес: ${location.pathname}`, stack, where]
    .filter(Boolean)
    .join('\n');
}

/** Ошибка экрана не убирает меню и сбрасывается при переходе на другой экран. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary key={pathname}>{children}</ErrorBoundary>;
}
