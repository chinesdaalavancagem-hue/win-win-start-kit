export type DayPeriod = "morning" | "afternoon" | "night";

export function getDayPeriod(): DayPeriod {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "night";
}

export const greetings: Record<DayPeriod, string> = {
  morning: "Bom dia",
  afternoon: "Boa tarde",
  night: "Boa noite",
};

export const verses: Record<DayPeriod, { text: string; reference: string }> = {
  morning: {
    text: "O Senhor é o meu pastor; nada me faltará.",
    reference: "Salmos 23:1",
  },
  afternoon: {
    text: "Consagre ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos.",
    reference: "Provérbios 16:3",
  },
  night: {
    text: "Em paz me deito e logo adormeço, pois só tu, Senhor, me fazes viver em segurança.",
    reference: "Salmos 4:8",
  },
};
