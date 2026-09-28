/**
 * Чистит поток токенов модели «на лету»:
 * - вырезает <think>…</think> (если модель всё же «думает» вслух);
 * - превращает маркеры <step>N</step> в события прогресса плана;
 * - убирает служебные <stage>…</stage> и <checkpoint>…</checkpoint>;
 * - придерживает хвост, похожий на начало маркера, пока он не допишется.
 * Возвращает новый видимый текст (delta), и клиент просто склеивает кусочки. Если модель «думала»
 * без открывающего <think> и уже показанное оказалось рассуждением (пришёл одинокий </think>),
 * возвращает reset — весь видимый текст заново.
 */
export class StreamCleaner {
  private raw = '';
  private emitted = '';
  private readonly steps = new Set<number>();

  push(chunk: string) {
    this.raw += chunk;
    return this.flush(false);
  }

  end() {
    return this.flush(true);
  }

  get text(): string {
    return this.visible(true).text;
  }

  private visible(final: boolean) {
    let text = this.raw.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
    const orphan = text.lastIndexOf('</think>');
    if (orphan >= 0) text = text.slice(orphan + '</think>'.length);
    const openThink = text.indexOf('<think>');
    if (openThink >= 0) text = text.slice(0, openThink);

    const steps: number[] = [];
    text = text.replace(/<step>\s*(\d+)\s*<\/step>[ \t]*\n?/g, (_m, n: string) => {
      steps.push(Number(n));
      return '';
    });
    text = text.replace(/<(stage|checkpoint)>[\s\S]*?<\/\1>[ \t]*\n?/g, '');

    if (!final) {
      const open = text.match(/<(step|stage|checkpoint)>[^]*$/);
      if (open?.index !== undefined) text = text.slice(0, open.index);
      const lt = text.lastIndexOf('<');
      if (lt >= 0 && lt > text.length - 16 && !text.slice(lt).includes('>'))
        text = text.slice(0, lt);
    }
    return { text: final ? text.trim() : text.replace(/^\s+/, ''), steps };
  }

  private flush(final: boolean) {
    const { text, steps } = this.visible(final);
    const newSteps = steps.filter((n) => !this.steps.has(n));
    newSteps.forEach((n) => this.steps.add(n));
    // в конце текст обрезается по краям — хвостовые пробелы не считаем расхождением
    const shown = final ? this.emitted.trimEnd() : this.emitted;
    if (!text.startsWith(shown)) {
      // показанное раньше оказалось рассуждением — заменяем целиком
      this.emitted = text;
      return { delta: '', reset: text, steps: newSteps };
    }
    const delta = text.slice(shown.length);
    this.emitted = text;
    return { delta, reset: null as string | null, steps: newSteps };
  }
}
