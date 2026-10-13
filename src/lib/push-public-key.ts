// Chave pública VAPID (não é segredo). A chave privada fica apenas nos segredos do servidor.
export const VAPID_PUBLIC_KEY: string =
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ||
  "BKwDR-gw-1U1DjK53C5dcfMuXsgy8WiqpYvawpIeTK_76R8CIIRGpCI76WmG1-CTv5TzEWtYu5p4GFSMM4882iQ";
