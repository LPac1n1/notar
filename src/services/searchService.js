import { queryPrepared } from "./db/connection.js";

const SEARCH_LIMIT = 6;

export async function globalSearch(query) {
  const q = query.trim();
  if (!q) return { donors: [], people: [], imports: [] };

  const like = `%${q}%`;

  const [donors, people, imports] = await Promise.all([
    queryPrepared(
      `SELECT id, name, cpf, donor_type, is_active
       FROM donors
       WHERE LOWER(name) LIKE LOWER(?) OR cpf LIKE ?
       ORDER BY is_active DESC, name ASC
       LIMIT ?`,
      [like, like, SEARCH_LIMIT],
    ),
    queryPrepared(
      `SELECT p.id, p.name, p.cpf
       FROM people p
       WHERE (LOWER(p.name) LIKE LOWER(?) OR p.cpf LIKE ?)
         AND NOT EXISTS (SELECT 1 FROM donors d WHERE d.person_id = p.id)
       ORDER BY p.name ASC
       LIMIT ?`,
      [like, like, SEARCH_LIMIT],
    ),
    queryPrepared(
      `SELECT id, file_name, strftime(reference_month, '%Y-%m') AS reference_month, status
       FROM imports
       WHERE LOWER(file_name) LIKE LOWER(?)
       ORDER BY reference_month DESC
       LIMIT 4`,
      [like],
    ),
  ]);

  return {
    donors: donors.toArray().map((r) => ({
      id: String(r.id),
      name: String(r.name),
      cpf: String(r.cpf ?? ""),
      donorType: String(r.donor_type ?? ""),
      isActive: Boolean(r.is_active),
    })),
    people: people.toArray().map((r) => ({
      id: String(r.id),
      name: String(r.name),
      cpf: String(r.cpf ?? ""),
    })),
    imports: imports.toArray().map((r) => ({
      id: String(r.id),
      fileName: String(r.file_name),
      referenceMonth: String(r.reference_month ?? ""),
      status: String(r.status ?? ""),
    })),
  };
}
