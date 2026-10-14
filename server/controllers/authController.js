const { db, auth, FieldValue } = require("../config/firebaseAdmin");

const ROLES = ["citizen", "responder", "commander"];

exports.saveProfile = async (req, res, next) => {
  try {
    const { name = "", phone = "", role = "citizen", inviteCode = "" } = req.body;

    if (name.trim().length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters" });
    }
    if (!ROLES.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const ref = db.collection("users").doc(req.user.uid);
    if ((await ref.get()).exists) {
      return res.status(409).json({ message: "Profile already exists" });
    }

    const codes = {
      responder: process.env.RESPONDER_CODE,
      commander: process.env.COMMANDER_CODE,
    };
    if (role !== "citizen" && (!codes[role] || inviteCode.trim() !== codes[role])) {
      return res.status(403).json({ message: "Invalid invite code for this role" });
    }

    const user = {
      uid: req.user.uid,
      name: name.trim(),
      email: req.user.email,
      phone: phone.trim(),
      role,
      status: "unknown", // safe | unknown | sos
      createdAt: FieldValue.serverTimestamp(),
    };

    await ref.set(user);
    await auth.setCustomUserClaims(req.user.uid, { role });

    res.status(201).json({ user: { ...user, createdAt: new Date().toISOString() } });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const snap = await db.collection("users").doc(req.user.uid).get();
    if (!snap.exists) return res.status(404).json({ message: "Profile not found" });
    const data = snap.data();
    res.json({ user: { ...data, createdAt: data.createdAt?.toDate?.().toISOString() || null } });
  } catch (err) {
    next(err);
  }
};