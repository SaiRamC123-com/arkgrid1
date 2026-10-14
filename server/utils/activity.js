

const { db } = require("../config/firebaseAdmin");
const { FieldValue } = require("firebase-admin/firestore");

// All family IDs this user belongs to
async function familyIdsOf(uid) {
  const snap = await db
    .collection("families")
    .where("memberIds", "array-contains", uid)
    .get();
  return snap.docs.map((d) => d.id);
}

// Write one activity entry to every family in the list
async function logActivity(familyIds, entry) {
  if (!familyIds || !familyIds.length) return;
  const batch = db.batch();
  for (const fid of familyIds) {
    const ref = db.collection("families").doc(fid).collection("activity").doc();
    batch.set(ref, { ...entry, createdAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
}

module.exports = { familyIdsOf, logActivity };