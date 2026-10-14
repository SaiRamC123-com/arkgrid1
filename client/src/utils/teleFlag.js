const KEY = "ark_tele_on";
const bus = new EventTarget();

export const getTele = () => localStorage.getItem(KEY) === "1";
export const setTele = (on) => {
  localStorage.setItem(KEY, on ? "1" : "0");
  bus.dispatchEvent(new Event("change"));
};
export const subscribeTele = (cb) => {
  bus.addEventListener("change", cb);
  return () => bus.removeEventListener("change", cb);
};