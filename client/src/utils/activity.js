const { admin, db } = require("../config/firebaseAdmin");

exports.logActivity = async (familyIds, entry) => {
  if (!familyIds.length) return;
  const batch = db.batch();
  familyIds.forEach((fid) => {
    const ref = db.collection("families").doc(fid).collection("activity").doc();
    batch.set(ref, { ...entry, at: admin.firestore.FieldValue.serverTimestamp() });
  });
  await batch.commit();
};

exports.familyIdsOf = async (uid) => {
  const snap = await db.collection("families").where("memberUids", "array-contains", uid).get();
  return snap.docs.map((d) => d.id);
};