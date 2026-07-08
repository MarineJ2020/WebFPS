export function createButton(label: string, onClick: () => void, variant: "primary" | "secondary" = "secondary"): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = label;
  button.type = "button";
  button.className = `ui-button ui-button-${variant}`;
  button.addEventListener("click", onClick);
  return button;
}

export function createPanel(className = ""): HTMLDivElement {
  const panel = document.createElement("div");
  panel.className = `ui-panel${className ? ` ${className}` : ""}`;
  return panel;
}

export function createNumberInput(
  label: string,
  value: number,
  options: { step?: number; min?: number; onChange: (value: number) => void },
): HTMLLabelElement {
  const row = document.createElement("label");
  row.className = "ui-field";

  const text = document.createElement("span");
  text.textContent = label;
  row.appendChild(text);

  const input = document.createElement("input");
  input.type = "number";
  input.value = formatNumber(value);
  input.step = String(options.step ?? 0.25);
  if (options.min !== undefined) input.min = String(options.min);
  input.addEventListener("change", () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) options.onChange(next);
  });
  row.appendChild(input);

  return row;
}

export function createSelect<T extends string>(
  label: string,
  value: T,
  options: readonly T[],
  onChange: (value: T) => void,
): HTMLLabelElement {
  const row = document.createElement("label");
  row.className = "ui-field";

  const text = document.createElement("span");
  text.textContent = label;
  row.appendChild(text);

  const select = document.createElement("select");
  for (const option of options) {
    const optionEl = document.createElement("option");
    optionEl.value = option;
    optionEl.textContent = option;
    select.appendChild(optionEl);
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value as T));
  row.appendChild(select);

  return row;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
