export type Config = { port: number; hote: string; secret: string; production: boolean; codeSite: string; trustProxy: boolean };
export function lireConfig(env: Record<string, string | undefined>): Config {
  const secret = env.SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("SESSION_SECRET manquant ou trop court (32 caractères minimum). Générez-en un : echo \"SESSION_SECRET=\\\"$(openssl rand -base64 48)\\\"\" >> .env");
  const port = Number(env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT invalide : ${env.PORT}`);
  return { port, hote: env.HOST ?? "0.0.0.0", secret, production: env.NODE_ENV === "production", codeSite: env.SITE_CODE ?? "NDM", trustProxy: env.TRUST_PROXY === "true" };
}
