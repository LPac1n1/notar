import { useDonorStore } from "../store/useDonorStore";
import { useState } from "react";
import { nanoid } from "nanoid";

export default function Donors() {
  const { donors, addDonor, removeDonor } = useDonorStore();
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");

  const handleAdd = () => {
    addDonor({
      id: nanoid(),
      name,
      cpf,
    });

    setName("");
    setCpf("");
  };

  const handleRemove = (id) => {
    removeDonor(id);
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">Doadores</h1>

      <h2 className="mb-4">Quantidade de doadores: {donors.length}</h2>

      <div className="flex gap-2 mb-4">
        <input
          className="border p-2"
          placeholder="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border p-2"
          placeholder="CPF"
          value={cpf}
          onChange={(e) => setCpf(e.target.value)}
        />
        <button onClick={handleAdd} className="bg-blue-500 text-white px-4">
          Adicionar
        </button>
      </div>

      <ul>
        {donors.map((d) => (
          <li key={d.id}>
            {d.name} - {d.cpf}
            <button
              onClick={() => handleRemove(d.id)}
              className="bg-red-500 text-white px-4 ml-2"
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
