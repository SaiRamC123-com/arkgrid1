const { getStorage } = require("firebase-admin/storage");

module.exports = () => {
  const name = process.env.FIREBASE_STORAGE_BUCKET;
  return name ? getStorage().bucket(name) : null;
};