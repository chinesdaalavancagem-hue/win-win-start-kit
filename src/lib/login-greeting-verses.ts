export type DayPeriod = "morning" | "afternoon" | "night";

export type BibleVerse = {
  text: string;
  reference: string;
};

/** Resolve o período usando a hora local; aceita uma data para facilitar testes. */
export function getDayPeriod(date: Date = new Date()): DayPeriod {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "night";
}

export const greetings: Record<DayPeriod, string> = {
  morning: "Bom dia",
  afternoon: "Boa tarde",
  night: "Boa noite",
};

export const verses: Record<DayPeriod, BibleVerse[]> = {
  morning: [
    { text: "O Senhor é o meu pastor; nada me faltará.", reference: "Salmos 23:1" },
    { text: "Confia no Senhor de todo o teu coração.", reference: "Provérbios 3:5" },
    { text: "Entrega o teu caminho ao Senhor; confia nele.", reference: "Salmos 37:5" },
    { text: "Tudo posso naquele que me fortalece.", reference: "Filipenses 4:13" },
    { text: "Os que esperam no Senhor renovarão as suas forças.", reference: "Isaías 40:31" },
    { text: "Este é o dia que fez o Senhor; regozijemo-nos nele.", reference: "Salmos 118:24" },
    { text: "O coração do homem planeja o seu caminho, mas o Senhor lhe dirige os passos.", reference: "Provérbios 16:9" },
    { text: "Se algum de vós tem falta de sabedoria, peça-a a Deus.", reference: "Tiago 1:5" },
    { text: "Sede fortes e corajosos; não temais.", reference: "Deuteronômio 31:6" },
    { text: "O Senhor é a minha luz e a minha salvação; a quem temerei?", reference: "Salmos 27:1" },
    { text: "Buscai primeiro o Reino de Deus e a sua justiça.", reference: "Mateus 6:33" },
    { text: "Tudo quanto fizerdes, fazei-o de todo o coração.", reference: "Colossenses 3:23" },
    { text: "A bênção do Senhor é que enriquece.", reference: "Provérbios 10:22" },
    { text: "O temor do Senhor é o princípio da sabedoria.", reference: "Provérbios 9:10" },
    { text: "O Senhor te guiará continuamente.", reference: "Isaías 58:11" },
    { text: "Em Deus faremos proezas.", reference: "Salmos 60:12" },
    { text: "Não nos cansemos de fazer o bem.", reference: "Gálatas 6:9" },
    { text: "A alegria do Senhor é a vossa força.", reference: "Neemias 8:10" },
    { text: "O Senhor firma os passos de um homem bom.", reference: "Salmos 37:23" },
    { text: "Reconhece-o em todos os teus caminhos, e ele endireitará as tuas veredas.", reference: "Provérbios 3:6" },
  ],
  afternoon: [
    { text: "Consagre ao Senhor tudo o que você faz, e os seus planos serão bem-sucedidos.", reference: "Provérbios 16:3" },
    { text: "A resposta branda desvia o furor.", reference: "Provérbios 15:1" },
    { text: "O prudente vê o perigo e esconde-se.", reference: "Provérbios 22:3" },
    { text: "Os planos do diligente tendem à abundância.", reference: "Provérbios 21:5" },
    { text: "Melhor é o fim das coisas do que o princípio delas.", reference: "Eclesiastes 7:8" },
    { text: "A sabedoria é melhor do que as armas de guerra.", reference: "Eclesiastes 9:18" },
    { text: "O que é fiel no pouco também é fiel no muito.", reference: "Lucas 16:10" },
    { text: "Amai-vos cordialmente uns aos outros com amor fraternal.", reference: "Romanos 12:10" },
    { text: "Alegrai-vos na esperança, sede pacientes na tribulação.", reference: "Romanos 12:12" },
    { text: "A paz de Deus guardará os vossos corações e os vossos sentimentos.", reference: "Filipenses 4:7" },
    { text: "Seja, porém, o vosso falar: Sim, sim; não, não.", reference: "Mateus 5:37" },
    { text: "O fruto do Espírito é amor, alegria, paz e domínio próprio.", reference: "Gálatas 5:22-23" },
    { text: "E tudo quanto fizerdes por palavras ou por obras, fazei-o em nome do Senhor Jesus.", reference: "Colossenses 3:17" },
    { text: "Tudo tem o seu tempo determinado.", reference: "Eclesiastes 3:1" },
    { text: "A palavra dita a seu tempo quão boa é!", reference: "Provérbios 15:23" },
    { text: "Aquietai-vos e sabei que eu sou Deus.", reference: "Salmos 46:10" },
    { text: "O amor seja não fingido. Aborrecei o mal e apegai-vos ao bem.", reference: "Romanos 12:9" },
    { text: "A fé é o firme fundamento das coisas que se esperam.", reference: "Hebreus 11:1" },
    { text: "Em todo o trabalho há proveito.", reference: "Provérbios 14:23" },
    { text: "Dando sempre graças por tudo a nosso Deus.", reference: "Efésios 5:20" },
  ],
  night: [
    { text: "Em paz me deito e logo adormeço, pois só tu, Senhor, me fazes viver em segurança.", reference: "Salmos 4:8" },
    { text: "Lançando sobre ele toda a vossa ansiedade, porque ele tem cuidado de vós.", reference: "1 Pedro 5:7" },
    { text: "Não andeis ansiosos por coisa alguma.", reference: "Filipenses 4:6" },
    { text: "Deixo-vos a paz, a minha paz vos dou.", reference: "João 14:27" },
    { text: "O Senhor te abençoe e te guarde.", reference: "Números 6:24" },
    { text: "O choro pode durar uma noite, mas a alegria vem pela manhã.", reference: "Salmos 30:5" },
    { text: "A minha graça te basta, porque o meu poder se aperfeiçoa na fraqueza.", reference: "2 Coríntios 12:9" },
    { text: "Descansa no Senhor e espera nele.", reference: "Salmos 37:7" },
    { text: "O Senhor pelejará por vós, e vos calareis.", reference: "Êxodo 14:14" },
    { text: "A misericórdia do Senhor é a causa de não sermos consumidos.", reference: "Lamentações 3:22" },
    { text: "Não temas, porque eu sou contigo; não te assombres, porque eu sou o teu Deus; eu te fortaleço.", reference: "Isaías 41:10" },
    { text: "O Senhor está perto dos que têm o coração quebrantado.", reference: "Salmos 34:18" },
    { text: "O eterno Deus é a tua habitação, e por baixo estão os braços eternos.", reference: "Deuteronômio 33:27" },
    { text: "Deus é o nosso refúgio e fortaleza, socorro bem presente na angústia.", reference: "Salmos 46:1" },
    { text: "Bendize, ó minha alma, ao Senhor, e não te esqueças de nenhum de seus benefícios.", reference: "Salmos 103:2" },
    { text: "O Senhor dará força ao seu povo; o Senhor abençoará o seu povo com paz.", reference: "Salmos 29:11" },
    { text: "Aquele que habita no esconderijo do Altíssimo descansará à sombra do Onipotente.", reference: "Salmos 91:1" },
    { text: "Porque andamos por fé e não por vista.", reference: "2 Coríntios 5:7" },
    { text: "Sede agradecidos.", reference: "Colossenses 3:15" },
    { text: "O Deus de esperança vos encha de todo o gozo e paz.", reference: "Romanos 15:13" },
  ],
};

/**
 * Retorna sempre o mesmo versículo para a mesma data civil local e período.
 * Não usa Math.random(), portanto o resultado é estável durante a hidratação.
 */
export function getDailyVerse(
  period: DayPeriod,
  date: Date = new Date(),
): BibleVerse {
  const catalog = verses[period];
  const dayNumber = Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
  const periodOffset: Record<DayPeriod, number> = {
    morning: 0,
    afternoon: 7,
    night: 13,
  };
  const index =
    ((dayNumber + periodOffset[period]) % catalog.length + catalog.length) %
    catalog.length;

  return catalog[index]!;
}
