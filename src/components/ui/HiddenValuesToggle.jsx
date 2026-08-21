import Button from "./Button";
import { HideValuesIcon, ShowValuesIcon } from "./icons";

/**
 * Mostra ou esconde os valores do painel.
 *
 * Existe porque o painel abre com cifras, CPFs e nomes de doadores à vista, e
 * nem sempre quem abre está sozinho. O estado é lembrado entre visitas — ver
 * `useHiddenValues` —, então quem prefere um dos modos escolhe uma vez.
 *
 * `aria-pressed` em vez de só trocar o rótulo: quem usa leitor de tela precisa
 * saber que é um botão de dois estados, e qual está valendo.
 */
export default function HiddenValuesToggle({ isHidden, onToggle }) {
  return (
    <Button
      variant="subtle"
      onClick={onToggle}
      aria-pressed={isHidden}
      leftIcon={
        isHidden ? (
          <ShowValuesIcon className="h-4 w-4" />
        ) : (
          <HideValuesIcon className="h-4 w-4" />
        )
      }
      title={
        isHidden
          ? "Os valores estão ocultos. Clique para exibir."
          : "Os valores estão visíveis. Clique para ocultar."
      }
    >
      {isHidden ? "Mostrar valores" : "Ocultar valores"}
    </Button>
  );
}
