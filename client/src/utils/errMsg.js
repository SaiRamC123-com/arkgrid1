const map = {
  "auth/invalid-credential": "Incorrect email or password",
  "auth/user-not-found": "No account found with this email",
  "auth/wrong-password": "Incorrect email or password",
  "auth/email-already-in-use": "This email is already registered",
  "auth/weak-password": "Password must be at least 6 characters",
  "auth/invalid-email": "Enter a valid email address",
  "auth/too-many-requests": "Too many attempts. Try again later",
  "auth/network-request-failed": "Network error. Check your connection",
};

export const errMsg = (err) =>
  map[err?.code] || err?.response?.data?.message || err?.message || "Something went wrong";