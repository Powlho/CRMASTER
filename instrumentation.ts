export async function register() {
  // Uniquement côté serveur Node (pas dans le middleware Edge).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMaintenance } = await import("./lib/data/maintenance");
    startMaintenance();
  }
}
