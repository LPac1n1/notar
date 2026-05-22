import { useEffect, useRef, useState } from "react";
import Button from "../../../components/ui/Button";
import CopyableValue from "../../../components/ui/CopyableValue";
import StatusBadge from "../../../components/ui/StatusBadge";
import {
  EditIcon,
  MoreIcon,
  TrashIcon,
  UserIcon,
} from "../../../components/ui/icons";
import { formatDateTimePtBR, formatMonthYear } from "../../../utils/date";
import { formatInteger } from "../../../utils/format";

function DonorActionMenu({
  donor,
  onDeactivate,
  onEdit,
  onOpenProfile,
  onReactivate,
  onRemove,
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (
        triggerRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const runAction = (callback) => {
    setOpen(false);
    callback();
  };

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Mais ações"
        className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--surface-strong)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--text-main)]"
      >
        <MoreIcon className="h-5 w-5" />
      </button>

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-elevated)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onOpenProfile(donor.id))}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--text-main)] transition-colors hover:bg-[var(--surface-muted)]"
          >
            <UserIcon className="h-4 w-4 text-[var(--muted)]" />
            Ver perfil
          </button>
          {donor.isActive ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(() => onEdit(donor))}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--text-main)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              <EditIcon className="h-4 w-4 text-[var(--muted)]" />
              Editar
            </button>
          ) : null}
          {donor.isActive ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(() => onDeactivate(donor))}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--text-main)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              Desativar
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              onClick={() => runAction(() => onReactivate(donor))}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--text-main)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              Reativar
            </button>
          )}
          <div className="border-t border-[var(--line)]" />
          <button
            type="button"
            role="menuitem"
            onClick={() => runAction(() => onRemove(donor))}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--danger)] transition-colors hover:bg-[var(--danger-soft)]"
          >
            <TrashIcon className="h-4 w-4" />
            Remover
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function DonorListItem({
  donor,
  onDeactivate,
  onEdit,
  onOpenProfile,
  onReactivate,
  onRemove,
}) {
  return (
    <li className="group flex flex-col gap-4 rounded-md border border-[var(--line)] bg-[var(--surface-elevated)] p-4 md:flex-row md:items-stretch md:justify-between">
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <CopyableValue copyLabel="Copiar nome" value={donor.name}>
              <button
                type="button"
                onClick={() => onOpenProfile(donor.id)}
                className="text-left font-semibold text-[var(--text-main)] underline-offset-4 transition hover:text-[var(--text-main)] hover:underline"
              >
                {donor.name}
              </button>
            </CopyableValue>
            <StatusBadge status={donor.donorType} />
            {!donor.isActive ? (
              <>
                <StatusBadge status="inactive" />
                {donor.deactivatedSince ? (
                  <span className="text-xs text-[var(--muted)]">
                    desde {formatMonthYear(`${donor.deactivatedSince}-01`)}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>

          {/* Mobile-only context menu trigger (≤ md). Desktop renders the
              column of action buttons below instead. */}
          <div className="shrink-0 md:hidden">
            <DonorActionMenu
              donor={donor}
              onDeactivate={onDeactivate}
              onEdit={onEdit}
              onOpenProfile={onOpenProfile}
              onReactivate={onReactivate}
              onRemove={onRemove}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-sm text-[var(--muted)]">
            <span>CPF:</span>
            <CopyableValue copyLabel="Copiar CPF" value={donor.cpf}>
              <span>{donor.cpf}</span>
            </CopyableValue>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Demanda: {donor.demand || "Não informada"}
          </p>
          <p className="text-sm text-[var(--muted)]">
            Início: {donor.donationStartDate || "Não informado"}
          </p>
        </div>
        {donor.createdAt ? (
          <p className="mt-5 text-xs text-[var(--muted)]">
            Cadastrado em {formatDateTimePtBR(donor.createdAt)}
          </p>
        ) : null}

        {donor.donorType === "auxiliary" ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">Vinculado a</span>
            <span className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2.5 py-1 font-medium text-[var(--text-soft)]">
              {donor.holderName ? (
                <CopyableValue
                  copyLabel="Copiar nome"
                  value={donor.holderName}
                >
                  <span>{donor.holderName}</span>
                </CopyableValue>
              ) : (
                "Sem vínculo"
              )}
            </span>
            {donor.holderName ? (
              !donor.holderIsActiveDonor ? (
                <StatusBadge label="Pessoa de referência" tone="neutral" />
              ) : (
                <StatusBadge label="Titular" tone="info" />
              )
            ) : null}
            {donor.holderCpf ? (
              <CopyableValue
                className="text-xs text-[var(--muted)]"
                copyLabel="Copiar CPF"
                value={donor.holderCpf}
              >
                <span>{donor.holderCpf}</span>
              </CopyableValue>
            ) : null}
          </div>
        ) : donor.auxiliaryDonors.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-[var(--muted)]">
              {donor.auxiliaryDonors.length} auxiliar(es)
            </span>
            {donor.auxiliaryDonors.slice(0, 3).map((auxiliary) => (
              <span
                key={`${donor.id}-${auxiliary.cpf}`}
                className="rounded-md border border-[var(--line)] bg-[var(--surface-strong)] px-2.5 py-1 text-xs text-[var(--text-soft)]"
              >
                <CopyableValue copyLabel="Copiar nome" value={auxiliary.name}>
                  <span>{auxiliary.name}</span>
                </CopyableValue>
              </span>
            ))}
            {donor.auxiliaryDonors.length > 3 ? (
              <span className="text-xs text-[var(--muted)]">
                +{formatInteger(donor.auxiliaryDonors.length - 3)}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Desktop-only action column (md+). Mobile shows the context menu in
          the header row instead. Hidden until row is hovered or focused. */}
      <div className="hidden flex-col gap-2 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100 md:flex md:w-40 md:self-stretch">
        <Button
          className="w-full md:flex-1"
          onClick={() => onOpenProfile(donor.id)}
          variant="subtle"
          leftIcon={<UserIcon className="h-4 w-4" />}
        >
          Perfil
        </Button>
        {donor.isActive ? (
          <Button
            className="w-full md:flex-1"
            onClick={() => onEdit(donor)}
            variant="subtle"
            leftIcon={<EditIcon className="h-4 w-4" />}
          >
            Editar
          </Button>
        ) : null}
        {donor.isActive ? (
          <Button
            className="w-full md:flex-1"
            onClick={() => onDeactivate(donor)}
            variant="subtle"
          >
            Desativar
          </Button>
        ) : (
          <Button
            className="w-full md:flex-1"
            onClick={() => onReactivate(donor)}
            variant="subtle"
          >
            Reativar
          </Button>
        )}
        <Button
          className="w-full md:flex-1"
          onClick={() => onRemove(donor)}
          variant="danger"
          leftIcon={<TrashIcon className="h-4 w-4" />}
        >
          Remover
        </Button>
      </div>
    </li>
  );
}
