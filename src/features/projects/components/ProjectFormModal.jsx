import { useState } from "react";
import FormModal from "../../../components/ui/FormModal";
import TextInput from "../../../components/ui/TextInput";
import DemandColorField from "../../demands/components/DemandColorField";
import { DEFAULT_PROJECT_COLOR } from "../../../services/project/projectAssignmentSql";

/**
 * Criar ou renomear projeto.
 *
 * Só nome e cor. Os módulos não entram aqui: projeto novo nasce com o
 * conjunto mínimo, e decidir quais telas ele terá antes de existir um único
 * doador é uma pergunta que o usuário não tem como responder ainda.
 */
export default function ProjectFormModal({
  error = "",
  isSubmitting = false,
  onClose,
  onSubmit,
  project = null,
}) {
  const isEditing = Boolean(project);
  const [name, setName] = useState(project?.name ?? "");
  const [color, setColor] = useState(project?.color || DEFAULT_PROJECT_COLOR);

  return (
    <FormModal
      title={isEditing ? "Editar projeto" : "Adicionar projeto"}
      description={
        isEditing
          ? "O endereço do projeto na barra de endereços acompanha o nome."
          : "O projeto começa com Dashboard, Doadores e Anotações. Os demais módulos podem ser ligados depois."
      }
      confirmLabel={isEditing ? "Salvar alterações" : "Adicionar projeto"}
      isLoading={isSubmitting}
      feedbackMessage={error}
      onClose={onClose}
      onSubmit={() => onSubmit({ name, color })}
    >
      <div className="space-y-4">
        <TextInput
          label="Nome do projeto"
          name="name"
          placeholder="Nome do projeto"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <DemandColorField
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
      </div>
    </FormModal>
  );
}
