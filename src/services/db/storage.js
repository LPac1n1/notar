import {
  createSnapshotPayload,
  normalizeSnapshotPayload,
  snapshotHasData,
} from "../../utils/backup";
import {
  exportDatabaseSnapshot,
  restoreDatabaseSnapshot,
} from "./backup";
import {
  initDB,
  setOnAfterTransaction,
  supportsFileDatabaseSelection,
} from "./connection";
import {
  getStorageInfoSnapshot,
  updateStorageInfo,
} from "./events";

let connectedDatabaseFileHandle = null;

async function ensureFileHandlePermission(handle, requestPermission = false) {
  if (!handle) {
    return false;
  }

  const options = { mode: "readwrite" };
  const currentPermission = await handle.queryPermission?.(options);

  if (currentPermission === "granted") {
    return true;
  }

  if (!requestPermission || typeof handle.requestPermission !== "function") {
    return false;
  }

  return (await handle.requestPermission(options)) === "granted";
}

async function readSnapshotFromFileHandle(handle) {
  if (!handle) {
    return null;
  }

  const file = await handle.getFile();
  const text = await file.text();

  if (!text.trim()) {
    return null;
  }

  const parsedPayload = JSON.parse(text);
  return normalizeSnapshotPayload(parsedPayload);
}

async function persistSnapshotToFileHandle(handle, snapshot) {
  const writable = await handle.createWritable();
  const payload = JSON.stringify(createSnapshotPayload(snapshot), null, 2);

  await writable.write(payload);
  await writable.close();
}

async function persistConnectedFileSnapshot() {
  if (!connectedDatabaseFileHandle) {
    return;
  }

  const snapshot = await exportDatabaseSnapshot();
  await persistSnapshotToFileHandle(connectedDatabaseFileHandle, snapshot);
}

async function flushOpenFiles() {
  const info = getStorageInfoSnapshot();
  if (info.mode === "file" && connectedDatabaseFileHandle) {
    await persistConnectedFileSnapshot();
  }
}

// Register the post-write/transaction hook so that connection.execute and
// connection.runInTransaction persist the connected file handle automatically.
setOnAfterTransaction(flushOpenFiles);

function buildConnectedFileStorageInfo(handle) {
  return {
    mode: "file",
    isPersistent: true,
    label: "Arquivo de dados conectado",
    description:
      "Os dados do Notar estão sendo gravados no arquivo local conectado nesta sessão.",
    path: "",
    fileName: handle.name ?? "notar-dados.json",
  };
}

async function connectDatabaseFileHandle(
  handle,
  { emitChange = true, preserveCurrentData } = {},
) {
  if (!supportsFileDatabaseSelection()) {
    throw new Error(
      "Este navegador não suporta seleção de arquivo para usar um banco local em disco.",
    );
  }

  const hasPermission = await ensureFileHandlePermission(handle, true);
  if (!hasPermission) {
    throw new Error(
      "O navegador não liberou acesso de leitura e escrita ao arquivo selecionado.",
    );
  }

  await initDB();

  const file = await handle.getFile();
  const isEmptyFile = file.size === 0;
  const snapshotFromFile = isEmptyFile
    ? null
    : await readSnapshotFromFileHandle(handle);
  const currentSnapshot = preserveCurrentData
    ? await exportDatabaseSnapshot()
    : null;

  connectedDatabaseFileHandle = handle;
  updateStorageInfo(buildConnectedFileStorageInfo(handle));

  if (!isEmptyFile && snapshotFromFile) {
    await restoreDatabaseSnapshot(snapshotFromFile, {
      allowEmpty: true,
      emitChange,
    });
  } else if (!isEmptyFile && !snapshotFromFile) {
    throw new Error(
      "O arquivo selecionado não parece ser um arquivo de dados válido do Notar.",
    );
  }

  if (isEmptyFile && snapshotHasData(currentSnapshot)) {
    await persistSnapshotToFileHandle(handle, currentSnapshot);
  }

  return {
    storageInfo: getStorageInfoSnapshot(),
    migratedCurrentSession: isEmptyFile && snapshotHasData(currentSnapshot),
    usedExistingFile: !isEmptyFile,
  };
}

export async function getDatabaseStorageInfo() {
  await initDB();
  return getStorageInfoSnapshot();
}

export async function createDatabaseFile() {
  if (!supportsFileDatabaseSelection()) {
    throw new Error(
      "Este navegador não suporta a criação de arquivo local para o banco de dados.",
    );
  }

  const handle = await window.showSaveFilePicker({
    suggestedName: "notar-dados.json",
    types: [
      {
        description: "Banco de dados do Notar",
        accept: {
          "application/json": [".json"],
        },
      },
    ],
  });

  return connectDatabaseFileHandle(handle, { preserveCurrentData: true });
}

export async function openDatabaseFile({
  emitChange = true,
  onFileSelected,
} = {}) {
  if (!supportsFileDatabaseSelection()) {
    throw new Error(
      "Este navegador não suporta a abertura de arquivo local para o banco de dados.",
    );
  }

  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [
      {
        description: "Banco de dados do Notar",
        accept: {
          "application/json": [".json"],
        },
      },
    ],
  });

  if (!handle) {
    throw new Error("Nenhum arquivo foi selecionado.");
  }

  onFileSelected?.(handle);

  return connectDatabaseFileHandle(handle, {
    emitChange,
    preserveCurrentData: false,
  });
}

export async function disconnectDatabaseFile() {
  await initDB();
  connectedDatabaseFileHandle = null;
  updateStorageInfo({
    mode: "memory",
    isPersistent: false,
    label: "Arquivo desconectado",
    description:
      "Os dados atuais continuam na memória desta sessão. Para voltar a persistir, conecte um arquivo novamente.",
    path: "",
    fileName: "",
  });

  return {
    storageInfo: getStorageInfoSnapshot(),
  };
}
