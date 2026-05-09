/**
 * Barrel re-exporter for the donors domain. Phase 4 split the original
 * 1,063-line `donorService.js` into three cohesive modules:
 *
 *   - `donor/donorProfile.js`  — read-side queries (list, profile, cpf links)
 *   - `donor/donorWriter.js`   — CRUD writers (create/update/delete + auxiliaries)
 *   - `donor/donorActivity.js` — activate/deactivate choreography
 *
 * Existing callers continue to import from `services/donorService` and don't
 * need to know about the internal layout.
 */

export {
  listDonors,
  listHolderDonors,
  listDonorCpfLinks,
  getDonorProfile,
} from "./donor/donorProfile";

export {
  createDonor,
  updateDonor,
  deleteDonor,
  createAuxiliaryDonor,
  updateAuxiliaryDonor,
  deleteAuxiliaryDonor,
} from "./donor/donorWriter";

export {
  deactivateDonor,
  reactivateDonor,
  getDonorActivityConstraints,
} from "./donor/donorActivity";
