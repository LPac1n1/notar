import CopyableValue from "../../../components/ui/CopyableValue";
import { formatCpf } from "../../../utils/cpf";

export default function CopyableCpf({ className = "", value }) {
  const formattedCpf = formatCpf(value);

  return (
    <CopyableValue className={className} copyLabel="Copiar CPF" value={formattedCpf}>
      <span>{formattedCpf}</span>
    </CopyableValue>
  );
}
